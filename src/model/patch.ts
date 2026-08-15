/**
 * 手动编辑层：格子下标 → 豆号。
 *
 * 之所以不直接改 BeadGrid，是为了让参数变更（调亮度、切图纸样式、
 * 改抖动）重跑管线后手改仍然生效 —— patch 在管线跑完后覆盖上去。
 *
 * 历史用快照式：每次 apply 存一份完整 Map。一张图纸的手改通常几十处，
 * 每份快照几 KB，比维护正反向操作对简单得多，也不可能出现状态漂移。
 */
export class PatchHistory {
  #stack: Array<Map<number, number>> = [new Map()];
  #cursor = 0;
  readonly #maxDepth = 200;

  /** 当前状态的只读副本 */
  get current(): ReadonlyMap<number, number> {
    return new Map(this.#stack[this.#cursor]!);
  }

  get size(): number {
    return this.#stack[this.#cursor]!.size;
  }

  get canUndo(): boolean {
    return this.#cursor > 0;
  }

  get canRedo(): boolean {
    return this.#cursor < this.#stack.length - 1;
  }

  apply(index: number, beadIndex: number): void {
    const cur = this.#stack[this.#cursor]!;
    if (cur.get(index) === beadIndex) return; // 无变化，不记历史

    const next = new Map(cur);
    next.set(index, beadIndex);

    // 丢弃 redo 分支
    this.#stack = this.#stack.slice(0, this.#cursor + 1);
    this.#stack.push(next);

    if (this.#stack.length > this.#maxDepth) this.#stack.shift();
    this.#cursor = this.#stack.length - 1;
  }

  /** 批量应用多个修改，记为一个历史条目（一次撤销全部回退） */
  batchApply(entries: ReadonlyArray<readonly [number, number]>): void {
    if (entries.length === 0) return;
    const cur = this.#stack[this.#cursor]!;
    let changed = false;
    const next = new Map(cur);
    for (const [index, beadIndex] of entries) {
      if (next.get(index) !== beadIndex) {
        next.set(index, beadIndex);
        changed = true;
      }
    }
    if (!changed) return;

    this.#stack = this.#stack.slice(0, this.#cursor + 1);
    this.#stack.push(next);
    if (this.#stack.length > this.#maxDepth) this.#stack.shift();
    this.#cursor = this.#stack.length - 1;
  }

  undo(): boolean {
    if (!this.canUndo) return false;
    this.#cursor--;
    return true;
  }

  redo(): boolean {
    if (!this.canRedo) return false;
    this.#cursor++;
    return true;
  }

  clear(): void {
    this.#stack = [new Map()];
    this.#cursor = 0;
  }

  /** 从存档恢复。历史从此重新开始，不保留恢复前的撤销栈。 */
  restore(entries: ReadonlyArray<readonly [number, number]>): void {
    this.#stack = [new Map(entries)];
    this.#cursor = 0;
  }
}