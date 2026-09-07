/**
 * 项目运行时固定使用 Node.js 24 的内置 SQLite。
 * 仓库当前的 @types/node 仍是 20.x，尚未声明这个标准库，故在此补最小类型面。
 */
declare module "node:sqlite" {
  export interface StatementSync {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}
