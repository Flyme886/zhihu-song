/*
 * 纯展示用的字符串小工具。
 *
 * 为什么不放 model.ts：那份是数据契约，和 docs/design/model.ts 逐字节同步
 * （见 scripts/sync-contract.sh），往里加界面用的辅助函数会让两边永远对不上。
 * 契约里只该有契约。
 */

/**
 * 「小满」→「满」。立牌的红圆和结算面板的头像圆里都只放一个字，
 * 用末字比首字更像称呼。
 *
 * Array.from 而不是 name[0]：中文在 UTF-16 里可能占两个码元，
 * 按下标切会切出半个字（一个孤立的代理项，渲染成豆腐块）。
 */
export function lastChar(name: string): string {
  return Array.from(name).at(-1) ?? '?';
}
