import { describe, expect, it } from "vitest";
import {
  bearer,
  createUser,
  emailJobsFor,
  PASSWORD,
  refreshTokenFrom,
  resetTokenFrom,
  setupApp,
  uniqueEmail,
  uniqueIp,
} from "./helpers.js";

const getApp = setupApp();

describe("cadastro", () => {
  it("cria a conta, devolve o access token e o cookie httpOnly de refresh", async () => {
    const email = uniqueEmail();
    const response = await getApp().inject({
      method: "POST",
      url: "/auth/register",
      remoteAddress: uniqueIp(),
      payload: { name: "Maria", email, password: PASSWORD },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.accessToken).toBeTypeOf("string");
    expect(body.user).toMatchObject({ email, role: "USER", status: "ACTIVE" });
    expect(body.user).not.toHaveProperty("passwordHash");

    const cookie = response.cookies.find((c) => c.name === "refresh_token");
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/" });

    expect(await emailJobsFor(email, "welcome")).toHaveLength(1);
  });

  it("recusa e-mail duplicado", async () => {
    const user = await createUser(getApp());
    const response = await getApp().inject({
      method: "POST",
      url: "/auth/register",
      remoteAddress: uniqueIp(),
      payload: { name: "Outra", email: user.email, password: PASSWORD },
    });
    expect(response.statusCode).toBe(409);
  });

  it("recusa senha fraca", async () => {
    const response = await getApp().inject({
      method: "POST",
      url: "/auth/register",
      remoteAddress: uniqueIp(),
      payload: { name: "Fraca", email: uniqueEmail(), password: "12345678" },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("login", () => {
  it("dá a mesma resposta para senha errada e e-mail inexistente", async () => {
    const user = await createUser(getApp());
    const wrongPassword = await getApp().inject({
      method: "POST",
      url: "/auth/login",
      remoteAddress: uniqueIp(),
      payload: { email: user.email, password: "errada123" },
    });
    const unknownEmail = await getApp().inject({
      method: "POST",
      url: "/auth/login",
      remoteAddress: uniqueIp(),
      payload: { email: uniqueEmail(), password: "errada123" },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json().message).toBe(unknownEmail.json().message);
  });

  it("bloqueia com 429 depois de 5 tentativas no mesmo minuto", async () => {
    const ip = uniqueIp();
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) {
      const response = await getApp().inject({
        method: "POST",
        url: "/auth/login",
        remoteAddress: ip,
        payload: { email: uniqueEmail(), password: "errada123" },
      });
      codes.push(response.statusCode);
    }
    expect(codes).toEqual([401, 401, 401, 401, 401, 429, 429]);
  });

  it("ignora X-Forwarded-For de quem não é proxy confiável (não dá para burlar o rate limit)", async () => {
    const ip = uniqueIp();
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const response = await getApp().inject({
        method: "POST",
        url: "/auth/login",
        remoteAddress: ip,
        headers: { "x-forwarded-for": `192.168.99.${i}` }, // um IP "diferente" a cada tentativa
        payload: { email: uniqueEmail(), password: "errada123" },
      });
      codes.push(response.statusCode);
    }
    expect(codes.at(-1)).toBe(429);
  });
});

describe("sessão", () => {
  it("protege rotas sem token", async () => {
    const response = await getApp().inject({ method: "GET", url: "/users/me" });
    expect(response.statusCode).toBe(401);
  });

  it("renova o access token e rejeita o refresh token antigo (rotação)", async () => {
    const user = await createUser(getApp());

    const refresh = await getApp().inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { refresh_token: user.refreshToken },
    });
    expect(refresh.statusCode).toBe(200);
    expect(refreshTokenFrom(refresh)).not.toBe(user.refreshToken);

    // Reusar o token antigo (como faria quem o roubou) é rejeitado.
    const replay = await getApp().inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { refresh_token: user.refreshToken },
    });
    expect(replay.statusCode).toBe(401);
  });

  it("logout invalida o access token e o refresh token na hora", async () => {
    const user = await createUser(getApp());

    const logout = await getApp().inject({
      method: "POST",
      url: "/auth/logout",
      headers: bearer(user.accessToken),
      cookies: { refresh_token: user.refreshToken },
    });
    expect(logout.statusCode).toBe(204);

    const me = await getApp().inject({ method: "GET", url: "/users/me", headers: bearer(user.accessToken) });
    expect(me.statusCode).toBe(401);

    const refresh = await getApp().inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { refresh_token: user.refreshToken },
    });
    expect(refresh.statusCode).toBe(401);
  });
});

describe("recuperação de senha", () => {
  it("responde igual para e-mail inexistente e não enfileira nada", async () => {
    const email = uniqueEmail("ninguem");
    const response = await getApp().inject({
      method: "POST",
      url: "/auth/forgot-password",
      remoteAddress: uniqueIp(),
      payload: { email },
    });
    expect(response.statusCode).toBe(202);
    expect(await emailJobsFor(email)).toHaveLength(0);
  });

  it("fluxo completo: link novo invalida o anterior, uso único, derruba sessões", async () => {
    const app = getApp();
    const user = await createUser(app);
    const ip = uniqueIp();

    for (let i = 0; i < 2; i++) {
      const response = await app.inject({
        method: "POST",
        url: "/auth/forgot-password",
        remoteAddress: ip,
        payload: { email: user.email },
      });
      expect(response.statusCode).toBe(202);
    }
    const [first, second] = (await emailJobsFor(user.email, "password-reset")).map(resetTokenFrom);
    expect(first).not.toBe(second);

    const reset = (token: string, password: string) =>
      app.inject({ method: "POST", url: "/auth/reset-password", remoteAddress: ip, payload: { token, password } });

    expect((await reset(first!, "NovaSenha99")).statusCode).toBe(400); // invalidado pelo segundo pedido
    expect((await reset(second!, "NovaSenha99")).statusCode).toBe(204);
    expect((await reset(second!, "OutraSenha77")).statusCode).toBe(400); // uso único

    const oldSession = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { refresh_token: user.refreshToken },
    });
    expect(oldSession.statusCode).toBe(401);

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      remoteAddress: uniqueIp(),
      payload: { email: user.email, password: "NovaSenha99" },
    });
    expect(login.statusCode).toBe(200);
    expect(await emailJobsFor(user.email, "password-changed")).toHaveLength(1);
  });
});
