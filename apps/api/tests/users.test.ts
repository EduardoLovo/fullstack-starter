import { describe, expect, it } from "vitest";
import { bearer, createUser, PASSWORD, setupApp, uniqueIp } from "./helpers.js";

const getApp = setupApp();

describe("administração de usuários", () => {
  it("usuário comum não acessa rotas de admin", async () => {
    const user = await createUser(getApp());
    const response = await getApp().inject({ method: "GET", url: "/users", headers: bearer(user.accessToken) });
    expect(response.statusCode).toBe(403);
  });

  it("admin lista e busca usuários", async () => {
    const admin = await createUser(getApp(), { role: "ADMIN" });
    const target = await createUser(getApp(), { name: "Fulano Buscável" });

    const response = await getApp().inject({
      method: "GET",
      url: "/users?search=Buscável",
      headers: bearer(admin.accessToken),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.map((u: { id: string }) => u.id)).toContain(target.id);
  });

  it("admin não pode alterar o próprio perfil", async () => {
    const admin = await createUser(getApp(), { role: "ADMIN" });
    const response = await getApp().inject({
      method: "PATCH",
      url: `/users/${admin.id}`,
      headers: bearer(admin.accessToken),
      payload: { role: "USER" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("bloquear derruba as sessões e impede o login; desbloquear libera", async () => {
    const app = getApp();
    const admin = await createUser(app, { role: "ADMIN" });
    const user = await createUser(app);

    const setStatus = (status: "ACTIVE" | "BLOCKED") =>
      app.inject({ method: "PATCH", url: `/users/${user.id}`, headers: bearer(admin.accessToken), payload: { status } });
    const login = () =>
      app.inject({ method: "POST", url: "/auth/login", remoteAddress: uniqueIp(), payload: { email: user.email, password: PASSWORD } });

    expect((await setStatus("BLOCKED")).statusCode).toBe(200);

    const refresh = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { refresh_token: user.refreshToken },
    });
    expect(refresh.statusCode).toBe(401);
    expect((await login()).statusCode).toBe(403);

    expect((await setStatus("ACTIVE")).statusCode).toBe(200);
    expect((await login()).statusCode).toBe(200);
  });

  it("a lista fica em cache e é invalidada quando alguém se cadastra", async () => {
    const admin = await createUser(getApp(), { role: "ADMIN" });
    const list = () => getApp().inject({ method: "GET", url: "/users", headers: bearer(admin.accessToken) });

    await list();
    const cached = await list();
    expect(cached.headers["x-cache"]).toBe("HIT");

    await createUser(getApp());
    const fresh = await list();
    expect(fresh.headers["x-cache"]).toBe("MISS");
    expect(fresh.json().meta.total).toBe(cached.json().meta.total + 1);
  });
});
