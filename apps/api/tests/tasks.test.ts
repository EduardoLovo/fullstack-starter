import { describe, expect, it } from "vitest";
import { bearer, createUser, setupApp, type TestUser } from "./helpers.js";

const getApp = setupApp();

function api(user: TestUser) {
  const base = { headers: bearer(user.accessToken), remoteAddress: user.ip };
  return {
    list: (query = "") => getApp().inject({ ...base, method: "GET", url: `/tasks${query}` }),
    get: (id: string) => getApp().inject({ ...base, method: "GET", url: `/tasks/${id}` }),
    create: (payload: object) => getApp().inject({ ...base, method: "POST", url: "/tasks", payload }),
    update: (id: string, payload: object) => getApp().inject({ ...base, method: "PATCH", url: `/tasks/${id}`, payload }),
    remove: (id: string) => getApp().inject({ ...base, method: "DELETE", url: `/tasks/${id}` }),
  };
}

describe("CRUD de tarefas", () => {
  it("cria, lê, atualiza e exclui", async () => {
    const tasks = api(await createUser(getApp()));

    const created = await tasks.create({ title: "Estudar Docker", dueDate: "2026-10-10" });
    expect(created.statusCode).toBe(201);
    const task = created.json();
    expect(task).toMatchObject({ title: "Estudar Docker", status: "TODO", description: null });
    expect(task.dueDate).toBe("2026-10-10T00:00:00.000Z");

    expect((await tasks.get(task.id)).json().title).toBe("Estudar Docker");

    const updated = await tasks.update(task.id, { status: "DONE", description: "feito", dueDate: null });
    expect(updated.json()).toMatchObject({ status: "DONE", description: "feito", dueDate: null });

    expect((await tasks.remove(task.id)).statusCode).toBe(204);
    expect((await tasks.get(task.id)).statusCode).toBe(404);
  });

  // Muitos clientes HTTP mandam "Content-Type: application/json" mesmo sem corpo
  // (o k6 do monitoramento fazia isso, e o dashboard mostrou os 400).
  it("aceita DELETE com Content-Type JSON e corpo vazio", async () => {
    const user = await createUser(getApp());
    const tasks = api(user);
    const { id } = (await tasks.create({ title: "apagar" })).json();

    const response = await getApp().inject({
      method: "DELETE",
      url: `/tasks/${id}`,
      remoteAddress: user.ip,
      headers: { ...bearer(user.accessToken), "content-type": "application/json" },
    });
    expect(response.statusCode).toBe(204);
  });

  it("continua recusando JSON malformado", async () => {
    const user = await createUser(getApp());
    const response = await getApp().inject({
      method: "POST",
      url: "/tasks",
      remoteAddress: user.ip,
      headers: { ...bearer(user.accessToken), "content-type": "application/json" },
      payload: "{titulo quebrado",
    });
    expect(response.statusCode).toBe(400);
  });

  it("valida os dados de entrada", async () => {
    const tasks = api(await createUser(getApp()));
    expect((await tasks.create({ title: "" })).statusCode).toBe(400);
    expect((await tasks.create({ title: "x", status: "INVALIDO" })).statusCode).toBe(400);
    expect((await tasks.get("nao-e-uuid")).statusCode).toBe(400);

    const { id } = (await tasks.create({ title: "ok" })).json();
    expect((await tasks.update(id, {})).statusCode).toBe(400);
  });

  it("filtra por status e busca, com paginação", async () => {
    const tasks = api(await createUser(getApp()));
    for (let i = 1; i <= 5; i++) {
      await tasks.create({ title: `Tarefa ${i}`, status: i <= 2 ? "DONE" : "TODO" });
    }
    await tasks.create({ title: "Comprar café" });

    expect((await tasks.list("?status=DONE")).json().meta.total).toBe(2);
    expect((await tasks.list("?search=café")).json().meta.total).toBe(1);

    const page = (await tasks.list("?perPage=4&page=2")).json();
    expect(page.meta).toEqual({ page: 2, perPage: 4, total: 6 });
    expect(page.data).toHaveLength(2);
  });
});

describe("isolamento entre usuários", () => {
  it("um usuário não lê, edita nem exclui tarefas de outro (404)", async () => {
    const ana = api(await createUser(getApp()));
    const bruno = api(await createUser(getApp()));
    const { id } = (await ana.create({ title: "da Ana" })).json();

    expect((await bruno.list()).json().meta.total).toBe(0);
    expect((await bruno.get(id)).statusCode).toBe(404);
    expect((await bruno.update(id, { title: "hack" })).statusCode).toBe(404);
    expect((await bruno.remove(id)).statusCode).toBe(404);
    expect((await ana.get(id)).json().title).toBe("da Ana");
  });
});

describe("cache das tarefas", () => {
  it("MISS na primeira leitura, HIT na segunda, com a mesma resposta", async () => {
    const tasks = api(await createUser(getApp()));
    await tasks.create({ title: "uma" });

    const miss = await tasks.list();
    const hit = await tasks.list();
    expect(miss.headers["x-cache"]).toBe("MISS");
    expect(hit.headers["x-cache"]).toBe("HIT");
    expect(hit.body).toBe(miss.body);

    // Query diferente = chave diferente.
    expect((await tasks.list("?status=DONE")).headers["x-cache"]).toBe("MISS");
  });

  it("criar, editar e excluir invalidam o cache", async () => {
    const tasks = api(await createUser(getApp()));
    const { id } = (await tasks.create({ title: "uma" })).json();
    const warm = async () => {
      await tasks.list();
      expect((await tasks.list()).headers["x-cache"]).toBe("HIT");
    };

    await warm();
    await tasks.update(id, { status: "DONE" });
    const afterUpdate = await tasks.list();
    expect(afterUpdate.headers["x-cache"]).toBe("MISS");
    expect(afterUpdate.json().data[0].status).toBe("DONE");

    await warm();
    await tasks.remove(id);
    const afterDelete = await tasks.list();
    expect(afterDelete.headers["x-cache"]).toBe("MISS");
    expect(afterDelete.json().meta.total).toBe(0);
  });

  it("a escrita de um usuário não invalida o cache de outro", async () => {
    const ana = api(await createUser(getApp()));
    const bruno = api(await createUser(getApp()));

    await ana.list();
    await bruno.create({ title: "do Bruno" });
    expect((await ana.list()).headers["x-cache"]).toBe("HIT");
  });
});
