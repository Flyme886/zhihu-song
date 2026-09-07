"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Ambience,
  BackfireFlash,
  Ripple,
  Spotlight,
  useShake,
} from "@/components/Ambience";
import { AskerStandee } from "@/components/AskerStandee";
import { Controls } from "@/components/Controls";
import { DragGhost } from "@/components/DragGhost";
import { DropZones, type DropTarget } from "@/components/DropZone";
import { HandCard } from "@/components/HandCard";
import { OutcomeMark } from "@/components/OutcomeMark";
import { BACKFIRE_LINE, SettlementPanel } from "@/components/SettlementPanel";
import { Table } from "@/components/Table";
import { CallbackScreen } from "@/components/CallbackScreen";
import { OUTCOME_LABEL, type Card, type EraCallback, type Evidence } from "@/lib/model";
import { callbacksForYear, loadSecret, warmSecret } from "@/lib/secret";
import { evidenceFor } from "@/lib/topic";
import { askers, nodes } from "@/lib/topic";
import { STANDEE_SLOTS } from "@/lib/table-layout";
import {
  dealt,
  place,
  rectFor,
  type Placement,
  type Placements,
} from "@/lib/placement";
import { settleNode, type SettleRow, type Settlement } from "@/lib/settlement";
import { useCardDrag } from "@/lib/useCardDrag";
import { useReducedMotion, useMotionScale } from "@/lib/useReducedMotion";
import { useReveal } from "@/lib/useReveal";
import { useSceneAudio } from "@/lib/useSceneAudio";
import { useSound } from "@/lib/useSound";

/**
 * 一个节点的一整局：四张卡、三个提问者、一个弃牌区。
 *
 * 配卡阶段的状态只有两样 —— 每张卡在哪（placements）、哪张卡被举起来读（raised）。
 *
 * ── 为什么结算结果要另存一份 ──
 * 原来这里写着「结果是从 placements 推出来的，不另存」。点了结算之后不成立了：
 * 每格的叙述是从 narration[] 里随机取的一条，而随机的东西不能在渲染里算 ——
 * 一次重渲染就换一套措辞，字会在动画进行中当场变掉。
 * 所以点结算那一下把结果冻住存下来，之后只读不算（见 lib/settlement.ts）。
 */
export function Scene() {
  /** 当前走到第几个节点。0 起。切节点时下面一整排 per-node 状态都要跟着重置。 */
  const [nodeIndex, setNodeIndex] = useState(0);
  const node = nodes[nodeIndex];
  const isLastNode = nodeIndex >= nodes.length - 1;

  const cards = node.cards;
  const cardIds = useMemo(() => cards.map((c) => c.id), [cards]);

  const [placements, setPlacements] = useState<Placements>(() => dealt(cardIds));
  const [raised, setRaised] = useState<string | null>(null);
  const [status, setStatus] = useState("四张卡在手上，把三张分给三个提问者，剩下一张弃掉。");
  /** 点结算那一下冻住的结果。null = 还在配卡。 */
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  /** 讲完之后玩家点桌上某张卡回看那一格。null = 跟着揭示走。 */
  const [picked, setPicked] = useState<number | null>(null);
  /** 取暗牌失败了。静态站点没有服务端，只能让人重试。 */
  const [settleError, setSettleError] = useState(false);
  /**
   * 卡失效过场屏（§4.6）。非 null = 正压在桌面上，此时桌面停手。
   * 它带着要进入的下一节点号 —— 点「继续」时才真正切过去（见 advanceTo）。
   */
  const [callback, setCallback] = useState<{
    cb: EraCallback;
    card: Card;
    evidence?: Evidence;
    nextIndex: number;
  } | null>(null);
  /** 走完所有节点。复盘屏（§4.7）是下一块，先用占位收口，别让流程断在半空。 */
  const [finished, setFinished] = useState(false);

  /**
   * 跨节点找卡：回调指向的是上一节点那张过期的卡（card_2016_1 在 2016 节点里），
   * 所以要在所有节点里找，不能只在当前节点找。一次建好，回调过场时按 id 查。
   */
  const cardAcrossNodes = useMemo(() => {
    const m = new Map<string, Card>();
    for (const n of nodes) for (const c of n.cards) m.set(c.id, c);
    return m;
  }, []);

  /** 切到某个节点：把这一节点的四张卡重新发到手上，清掉上一节点的一切结算痕迹。 */
  const advanceTo = useCallback((index: number) => {
    const next = nodes[index];
    setNodeIndex(index);
    setPlacements(dealt(next.cards.map((c) => c.id)));
    setRaised(null);
    setSettlement(null);
    setPicked(null);
    setSettleError(false);
    setCallback(null);
    setStatus(`${next.year} 年，第 ${index + 1} / ${nodes.length} 个节点。四张卡在手上，分给三个提问者，弃掉一张。`);
  }, []);

  const motionScale = useMotionScale();
  const reveal = useReveal(settlement, motionScale);

  const { sfx, muted, toggleMuted } = useSound();
  /*
   * 氛围层的动效跟着系统开关走，声音不跟 ——
   * 「减少动效」说的是动效，把声音一起关掉是替用户多做了决定。
   * 想静音的人有喇叭按钮。
   */
  const reducedMotion = useReducedMotion();

  /** 配出去几张（含弃牌）—— 底噪的张力和结算按钮的脉冲都看它 */
  const placedCount = useMemo(
    () =>
      Object.values(placements).filter(
        (p) => p.kind === "asker" || p.kind === "discard",
      ).length,
    [placements],
  );

  const { backfireNonce } = useSceneAudio({ settlement, reveal, placedCount });
  const shakeRef = useShake(backfireNonce, !reducedMotion);

  const cardById = useMemo(
    () => new Map(cards.map((c) => [c.id, c])),
    [cards],
  );

  /** 卡回手上时回哪个槽：始终是它开局发到的那个位置，不然卡会互相挤。 */
  const handIndexOf = useCallback(
    (cardId: string) => Math.max(0, cardIds.indexOf(cardId)),
    [cardIds],
  );

  const describe = useCallback(
    (cardId: string, p: Placement) => {
      const name = cardById.get(cardId)?.headline ?? "这张卡";
      if (p.kind === "asker") return `「${name}」给了 ${askers[p.i]?.name ?? ""}。`;
      if (p.kind === "discard") return `「${name}」放进弃牌区。`;
      return `「${name}」拿回手上。`;
    },
    [cardById],
  );

  const assign = useCallback(
    (cardId: string, target: Placement) => {
      setPlacements((cur) => place(cur, cardId, target));
      setStatus(describe(cardId, target));
      // 三个落点三种声音。给人 / 弃掉 / 拿回来是三件不同的事，
      // 听着也该不一样 —— 弃牌更闷、拿回手上是往上走的。
      sfx(
        target.kind === "asker"
          ? "place"
          : target.kind === "discard"
            ? "discard"
            : "toHand",
      );
      // 配完就不看了 —— 举着的卡会挡住刚放下的那张
      setRaised(null);
      // 放下第一张就去取暗牌。离点结算还有好几秒，等揭示的时候请求早回来了 ——
      // 投影仪上最不该卡的那一下就在这里。warmSecret 自己去重，多调没事。
      warmSecret();
    },
    [describe, sfx],
  );

  const onDrop = useCallback(
    (cardId: string, t: DropTarget) => assign(cardId, t),
    [assign],
  );

  const { drag, onPointerDown, wasDrag } = useCardDrag(onDrop);

  /*
   * ── 捏起卡的那一声 ──
   * 不能挂在 onPointerDown 上：按下去还不算拖，要挪过 6px 才转成拖拽
   * （见 useCardDrag）。挂在按下上，每次想点开看卡都会先「唰」一声。
   * 所以盯着 drag 从 null 变成有值的那一下 —— 那才是真的拿起来了。
   */
  const wasDragging = useRef(false);
  useEffect(() => {
    const now = drag !== null;
    if (now && !wasDragging.current) sfx("lift");
    wasDragging.current = now;
  }, [drag, sfx]);

  /*
   * ── 扫过落点 ──
   * 只在「落点换了」时响一声，不是每帧。pointermove 一秒来几十次，
   * 盯着 target 的身份变化才是一次「扫过去了」。
   * 音效本身极短极轻（见 audio.ts 的 hover），因为拖一次卡会响好几回。
   */
  const lastTarget = useRef<string | null>(null);
  useEffect(() => {
    const t = drag?.target;
    const key = t ? (t.kind === "asker" ? `a${t.i}` : t.kind) : null;
    if (key !== null && key !== lastTarget.current) sfx("hover");
    lastTarget.current = key;
  }, [drag?.target, sfx]);

  const reset = useCallback(() => {
    setPlacements(dealt(cardIds));
    setRaised(null);
    setSettlement(null);
    setPicked(null);
    setSettleError(false);
    setStatus("已重置，四张卡都回到手上。");
    sfx("reset");
  }, [cardIds, sfx]);

  /** 点结算那一刻墙上的灯闪一下。变一次闪一次。 */
  const [surgeNonce, setSurgeNonce] = useState(0);

  const settle = useCallback(() => {
    sfx("settle");
    setSurgeNonce((n) => n + 1);
    setRaised(null);
    setPicked(null);
    setSettleError(false);
    // 三格依次揭示要好几秒，先报一句，读屏用户才知道点下去了；
    // 全文等讲完再念一次（见下面的 announce）—— 一格一句会互相打断。
    setStatus("已提交，三格依次揭示。");
    settleNode(node, askers, placements).then(
      (s) => setSettlement(s),
      (err: unknown) => {
        // 暗牌是结算时才取的，取不到就没法讲。不猜、不编，让人重试。
        console.error("[Scene] 结算取暗牌失败", err);
        setSettleError(true);
        setStatus("结算没能取到数据，请再点一次结算。");
      },
    );
  }, [node, placements, sfx]);

  /**
   * 结算讲完之后点「下一节点」。
   *
   * 下一节点若带失效回调（§4.6），先摆过场屏、点「继续」才真进下一节点；
   * 没有回调就直接切过去。末节点则收束到复盘占位。
   *
   * 回调藏在暗牌里（哪张卡会过期本身是剧透）。这时候暗牌早在结算时取过一次，
   * loadSecret() 命中缓存，不会再发请求，也不会卡。
   */
  const goNext = useCallback(() => {
    sfx("click");
    if (isLastNode) {
      setFinished(true);
      setStatus("所有节点已走完。复盘屏还在建，先到这里。");
      return;
    }
    const nextIndex = nodeIndex + 1;
    const nextNode = nodes[nextIndex];

    loadSecret().then(
      (secret) => {
        // 回调指向的过期卡在更早的节点里，跨节点找
        const cb = callbacksForYear(secret, nextNode.year).find((c) =>
          cardAcrossNodes.has(c.card_id),
        );
        const card = cb ? cardAcrossNodes.get(cb.card_id) : undefined;
        if (cb && card) {
          setCallback({
            cb,
            card,
            evidence: evidenceFor(card.evidence_answer_id),
            nextIndex,
          });
          setStatus(`一张 ${cb.from_year} 年的卡在 ${cb.to_year} 年失效了：攻略没写错，是版本变了。`);
        } else {
          advanceTo(nextIndex);
        }
      },
      // 暗牌取不到就别卡在这一屏 —— 直接进下一节点，回调过场缺了不致命
      () => advanceTo(nextIndex),
    );
  }, [advanceTo, cardAcrossNodes, isLastNode, nodeIndex, sfx]);

  /*
   * ── 读屏为什么等讲完才念全文 ──
   * 视觉上三格是一格一格出来的，那个顺序本身带着意思。但 aria-live="polite"
   * 每次改内容都会打断上一句，三格连着改就只剩最后一句听得完整。
   * 而且开了「减少动效」的人（读屏用户大概率开了）整条时间轴还会压到 40%，更念不完。
   * 所以点下去先报一句「已提交」，等讲完了再一次把三格连着念出来。
   */
  const settledText = useMemo(() => {
    if (!settlement) return null;
    const parts = settlement.rows.map((r) => {
      const head = `${r.askerName}，${OUTCOME_LABEL[r.outcome]}。${r.narration}${r.because}`;
      return r.reveal ? `${head} ${r.reveal} ${BACKFIRE_LINE}` : head;
    });
    return `${parts.join(" ")} ${discardFootnote(settlement)}`;
  }, [settlement]);

  // 算出来的，不塞回 status ——「讲完了就念全文」是从状态推出来的事实，
  // 不是又一次操作。写进 state 会多一次白跑的渲染，而且和 status 谁盖谁要看顺序。
  const announced = reveal.done && settledText ? settledText : status;

  /** 面板上正在说的那一格：讲完之后玩家点了卡就听他的，否则跟着揭示走。 */
  const activeRow: SettleRow | null = useMemo(() => {
    if (!settlement || reveal.landed === 0) return null;
    if (picked !== null) {
      return settlement.rows.find((r) => r.askerIndex === picked) ?? null;
    }
    return settlement.rows[reveal.landed - 1] ?? null;
  }, [settlement, reveal.landed, picked]);

  /** 已经揭到的格子（按提问者位置索引）—— 桌上的徽章看这个 */
  const landedByAsker = useMemo(() => {
    const m = new Map<number, SettleRow>();
    if (!settlement) return m;
    for (const r of settlement.rows.slice(0, reveal.landed)) {
      m.set(r.askerIndex, r);
    }
    return m;
  }, [settlement, reveal.landed]);

  const draggedCard = drag ? cardById.get(drag.cardId) : null;

  return (
    // relative 是给 Controls 定位用的。不写就会落到初始包含块上 ——
    // 现在看起来一样，但以后这一层套进任何带 transform 的容器就会漂走。
    <div className="relative h-full w-full overflow-hidden">
      {/*
       * 震屏套在里面一层，不套在外面那个 div 上。
       * 外层是 Controls 和红光闪的定位基准 —— 给它加 transform 会把
       * 闪光那层 fixed 也拽进来一起抖，而闪光是「整屏亮一下」，它不该跟着抖。
       */}
      <div ref={shakeRef} className="h-full w-full">
      <Table surgeNonce={reducedMotion ? 0 : surgeNonce}>
        {/* 提问者是议题级的，三个人贯穿所有节点 —— 不是每年换一批 */}
        {askers.map((asker, i) => {
          const slot = STANDEE_SLOTS[i];
          return slot ? (
            <AskerStandee
              key={asker.id}
              asker={asker}
              slot={slot}
              // 拖着的卡会压住落点框，所以「要给谁」是立牌在说 —— 见 AskerStandee
              hot={drag?.target?.kind === "asker" && drag.target.i === i}
            />
          ) : null;
        })}

        {/* 落点在卡的下面：拖拽中卡自己关掉了 pointer-events，指针才摸得到槽 */}
        <DropZones
          armed={!!drag}
          hot={drag?.target ?? null}
          askerNames={askers.map((a) => a.name)}
        />

        {/*
         * 聚光。打在正在讲的那一格上 —— 三格依次揭示时观众靠它跟上「现在说谁」。
         * key 带上位次：换格时重新挂载，动画才会重放。
         */}
        {!reducedMotion && activeRow && (
          <Spotlight key={activeRow.askerIndex} askerIndex={activeRow.askerIndex} />
        )}

        {cards.map((card) => {
          const p = placements[card.id] ?? { kind: "hand" as const, i: handIndexOf(card.id) };
          return (
            <HandCard
              key={card.id}
              card={card}
              slot={rectFor(p)}
              raised={raised === card.id}
              dragging={drag?.cardId === card.id}
              // 结算之后卡要定住 —— 徽章的描边贴着卡边，卡一浮就对不上了。
              // 相位按发牌顺序错开 1.3 秒，四张不会一起上下。
              idlePhase={
                reducedMotion || settlement ? undefined : handIndexOf(card.id) * 1.3
              }
              // 结算之后不接拖拽：徽章贴在点结算那一刻的布局上，卡挪了就对不上了
              onPointerDown={
                settlement ? undefined : (e) => onPointerDown(card.id, e)
              }
              onClick={() => {
                // 刚拖完那一下不要顺手当点击 —— 否则每次配完卡都会弹开一张卡面
                if (wasDrag(card.id)) return;
                /*
                 * 结算讲完之后，点提问者面前的卡是「把那一格调回面板上」，不是举起来读。
                 * 理由：前两格的叙述在第三格讲的时候就被顶掉了，玩家想回去看只有这条路。
                 * 举起来读的动作留给配卡阶段 —— 那时候要读的是卡面上的引文，
                 * 结算之后要读的是判定，两件事不一样。
                 */
                if (settlement && reveal.done && p.kind === "asker") {
                  setPicked((cur) => (cur === p.i ? null : p.i));
                  sfx("click");
                  return;
                }
                // 揭示进行中不接受点击 —— 别让一次误触把正在讲的那一格换掉
                if (settlement) return;
                // 举起来和放回去是两个方向的动作，两个声音
                sfx(raised === card.id ? "lower" : "raise");
                setRaised((cur) => (cur === card.id ? null : card.id));
              }}
            />
          );
        })}

        {/*
         * 判定记号：卡边收紧的描边 + 卡下面那枚筹码。揭到哪格才挂哪格。
         *
         * 没揭到的格子不能先挂一个透明的占位 —— 徽章里有一句给读屏念的
         * 「阿哲：反噬」，视觉上 opacity:0，读屏却照念。那就等于在讲之前先把答案说了。
         */}
        {settlement &&
          askers.map((asker, i) => {
            const row = landedByAsker.get(i);
            if (!row) return null;
            return (
              <OutcomeMark
                key={asker.id}
                outcome={row.outcome}
                askerIndex={i}
                askerName={asker.name}
                tightened={reveal.tightened.has(i)}
              />
            );
          })}

        {/*
         * 筹码磕在绒面上荡开的那一圈。
         * 每个位次只挂一次 —— landedByAsker 只增不减，所以这一圈在那一格揭开时
         * 挂上来跑完就完了，不会因为后面重渲染再荡一次。
         */}
        {settlement &&
          !reducedMotion &&
          [...landedByAsker.keys()].map((i) => <Ripple key={i} askerIndex={i} />)}

        {/* 说明面板。摊在手牌区那排空槽上 —— 结算时手上已经没牌了。 */}
        {settlement && (
          <SettlementPanel
            row={activeRow}
            showReveal={
              activeRow !== null && reveal.revealed.has(activeRow.askerIndex)
            }
            durationMs={600 * motionScale}
            footnote={reveal.done ? discardFootnote(settlement) : null}
          />
        )}
      </Table>

        {/*
         * 呼吸的光 + 浮尘，铺在桌子上面。
         * dim 只在揭示那几秒为真 —— 讲完就把灯放回来，不然后面回看卡片时
         * 整屏一直是暗的，那就只是个更暗的背景，不是「灯暗下来了」。
         */}
        <Ambience dim={settlement !== null && !reveal.done} />
      </div>

      {/* 反噬那一下的红光闪。在震屏容器外面 —— 它是整屏亮一下，不该跟着抖。
          常挂着不摘：它自己的静止态就是不可见（见 Ambience 的 BackfireFlash），
          所以不需要靠条件渲染来保证看不见。 */}
      <BackfireFlash nonce={backfireNonce} enabled={!reducedMotion} />

      {drag && draggedCard ? (
        <DragGhost
          drag={drag}
          card={draggedCard}
          evidence={evidenceFor(draggedCard.evidence_answer_id)}
        />
      ) : null}

      <Controls
        cards={cards}
        askers={askers}
        placements={placements}
        handIndexOf={handIndexOf}
        onAssign={assign}
        onReset={reset}
        onSettle={settle}
        onClickSound={() => sfx("click")}
        muted={muted}
        onToggleMuted={toggleMuted}
        status={announced}
        // 结算之后不能再改配卡 —— 桌上的徽章是按点结算那一刻的布局贴的，
        // 改了卡就和徽章对不上了。想重来走「重置本节点」。
        locked={settlement !== null && !settleError}
        // 讲完了才给「下一节点」—— 揭示还在跑时按下去会打断那句反噬的落点。
        // 末节点是「看复盘」，进复盘屏（§4.7，占位）。
        onNext={reveal.done ? goNext : undefined}
        nextLabel={reveal.done ? (isLastNode ? "看复盘" : "下一节点") : null}
      />

      {/* 顶栏：年份 + 第几个节点。§3.2 —— 让人始终知道走在时间轴的哪一格 */}
      <div
        className="pointer-events-none absolute left-[1.4vw] top-[1.4vh] z-40 flex items-baseline gap-[0.8vw]"
        style={{ color: "rgb(216 226 238 / 0.68)", letterSpacing: "0.08em" }}
      >
        <span style={{ fontSize: "clamp(11px, 1vw, 14px)" }}>和不同 · 你是那个答主</span>
        <span style={{ fontSize: "clamp(13px, 1.3vw, 18px)", color: "var(--color-red)", fontWeight: 600 }}>
          {node.year}
        </span>
        <span style={{ fontSize: "clamp(10px, 0.95vw, 13px)", color: "var(--color-dim)" }}>
          第 {nodeIndex + 1} / {nodes.length} 个节点
        </span>
      </div>

      {/* §4.6 卡失效过场屏。压在桌面上，点「继续」才进下一节点 */}
      {callback && (
        <CallbackScreen
          card={callback.card}
          evidence={callback.evidence}
          callback={callback.cb}
          onContinue={() => advanceTo(callback.nextIndex)}
          onClickSound={() => sfx("click")}
        />
      )}

      {/* 走完所有节点。复盘屏（§4.7）是下一块，这里先收口不让流程悬空 */}
      {finished && (
        <div
          className="absolute inset-0 z-[60] flex flex-col items-center justify-center gap-[2vh]"
          style={{ background: "rgb(8 9 11 / 0.94)", color: "var(--color-card)" }}
          role="dialog"
          aria-modal="true"
          aria-label="所有节点已走完"
        >
          <p style={{ fontSize: "clamp(18px, 2.2vw, 30px)", fontWeight: 600, fontFamily: "var(--font-serif)" }}>
            两个节点都走完了。
          </p>
          <p style={{ fontSize: "clamp(13px, 1.4vw, 18px)", color: "var(--color-dim)", maxWidth: "44ch", textAlign: "center", lineHeight: 1.6 }}>
            复盘屏（十年里分水岭扫过了谁）还在建。先回到第一个节点再打一局。
          </p>
          <button
            type="button"
            onClick={() => {
              setFinished(false);
              advanceTo(0);
            }}
            style={{
              minHeight: 44,
              padding: "0 1.6vw",
              borderRadius: 4,
              fontSize: "clamp(13px, 1.2vw, 16px)",
              letterSpacing: "0.1em",
              fontWeight: 600,
              color: "#fff",
              background: "var(--color-red)",
              border: "1px solid var(--color-red)",
              cursor: "pointer",
            }}
          >
            再来一局
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 面板底下那行小字。
 *
 * ── 为什么不说「它本来适合小雨」 ──
 * 风格草图和 PRD 都想在这儿点明弃掉的卡本来适合谁。但那句话是复盘屏的东西：
 * 复盘屏要拿同一张卡讲「分水岭扫过了谁」，结算屏先说穿了，复盘屏就没牌可打了。
 * 这里只做一件事 —— 让人记住这张卡（BRIEF §4.3：弃掉的卡要记住并传给复盘屏）。
 */
function discardFootnote(s: Settlement): string {
  if (!s.discardedHeadline) return "";
  return `你弃掉了「${s.discardedHeadline}」。复盘时会再见到它。`;
}
