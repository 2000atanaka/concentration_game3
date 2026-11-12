import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

type Suit = '♠' | '♥' | '♦' | '♣';
type Rank = 'A' | 'K' | 'Q' | 'J' | '10' | '9' | '8' | '7';

interface CardItem {
  id: number;
  pairId: string;
  suit: Suit;
  rank: Rank;
  isRed: boolean;
  isFlipped: boolean;
  isMatched: boolean;
}

const INITIAL_TIME_SECONDS = 300; // 制限時間5分（300秒）

// 8ペア（合計16枚：縦4×横4）のトランプ構成
const CARD_DEFINITIONS: { suit: Suit; rank: Rank; isRed: boolean }[] = [
  { suit: '♠', rank: 'A', isRed: false },
  { suit: '♥', rank: 'K', isRed: true },
  { suit: '♦', rank: 'Q', isRed: true },
  { suit: '♣', rank: 'J', isRed: false },
  { suit: '♥', rank: '10', isRed: true },
  { suit: '♠', rank: '9', isRed: false },
  { suit: '♦', rank: '8', isRed: true },
  { suit: '♣', rank: '7', isRed: false },
];

// シャッフル済みデッキ生成
function createShuffledDeck(): CardItem[] {
  const deck: CardItem[] = [];
  let idCounter = 0;

  CARD_DEFINITIONS.forEach((def) => {
    const pairId = `${def.suit}-${def.rank}`;
    for (let i = 0; i < 2; i++) {
      deck.push({
        id: idCounter++,
        pairId,
        suit: def.suit,
        rank: def.rank,
        isRed: def.isRed,
        isFlipped: false,
        isMatched: false,
      });
    }
  });

  // Fisher-Yates シャッフル
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

export default function App() {
  const [cards, setCards] = useState<CardItem[]>(() => createShuffledDeck());
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [moves, setMoves] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(INITIAL_TIME_SECONDS);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [gameStatus, setGameStatus] = useState<'playing' | 'won' | 'timeout'>('playing');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isLocked, setIsLocked] = useState<boolean>(false);

  const audioCtxRef = useRef<AudioContext | null>(null);

  // 効果音再生（Web Audio API）
  const playSound = useCallback(
    (type: 'flip' | 'match' | 'mismatch' | 'win' | 'timeout') => {
      if (!soundEnabled) return;
      try {
        if (!audioCtxRef.current) {
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          audioCtxRef.current = new AudioCtx();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') {
          ctx.resume();
        }

        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === 'flip') {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(520, now);
          osc.frequency.exponentialRampToValueAtTime(780, now + 0.08);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
          osc.start(now);
          osc.stop(now + 0.09);
        } else if (type === 'match') {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, now); // D5
          osc.frequency.setValueAtTime(880, now + 0.1); // A5
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
          osc.start(now);
          osc.stop(now + 0.3);
        } else if (type === 'mismatch') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(220, now);
          osc.frequency.linearRampToValueAtTime(160, now + 0.18);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          osc.start(now);
          osc.stop(now + 0.2);
        } else if (type === 'win') {
          const notes = [523.25, 659.25, 783.99, 1046.5];
          notes.forEach((freq, idx) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'triangle';
            o.connect(g);
            g.connect(ctx.destination);
            o.frequency.setValueAtTime(freq, now + idx * 0.1);
            g.gain.setValueAtTime(0.2, now + idx * 0.1);
            g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.35);
            o.start(now + idx * 0.1);
            o.stop(now + idx * 0.1 + 0.35);
          });
        } else if (type === 'timeout') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(300, now);
          osc.frequency.linearRampToValueAtTime(110, now + 0.5);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
          osc.start(now);
          osc.stop(now + 0.55);
        }
      } catch {
        // 音声再生ブロック時は無視
      }
    },
    [soundEnabled]
  );

  // 5分カウントダウンタイマー
  useEffect(() => {
    if (!isPlaying || gameStatus !== 'playing') return;

    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsPlaying(false);
          setGameStatus('timeout');
          playSound('timeout');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlaying, gameStatus, playSound]);

  // カードタップ処理
  const handleCardClick = (index: number) => {
    if (gameStatus !== 'playing' || isLocked) return;
    const targetCard = cards[index];
    if (targetCard.isFlipped || targetCard.isMatched) return;

    // 最初の1枚目を開いた瞬間にタイマースタート
    if (!isPlaying) {
      setIsPlaying(true);
    }

    playSound('flip');

    const updatedCards = cards.map((card, idx) =>
      idx === index ? { ...card, isFlipped: true } : card
    );
    setCards(updatedCards);

    const nextFlipped = [...flippedIndices, index];
    setFlippedIndices(nextFlipped);

    // 2枚めくった時のペア判定
    if (nextFlipped.length === 2) {
      setIsLocked(true);
      setMoves((m) => m + 1);

      const [firstIdx, secondIdx] = nextFlipped;
      const firstCard = updatedCards[firstIdx];
      const secondCard = updatedCards[secondIdx];

      if (firstCard.pairId === secondCard.pairId) {
        // ペア一致
        window.setTimeout(() => {
          playSound('match');
          setCards((prevCards) => {
            const matchedCards = prevCards.map((c, idx) =>
              idx === firstIdx || idx === secondIdx ? { ...c, isMatched: true } : c
            );
            const allMatched = matchedCards.every((c) => c.isMatched);
            if (allMatched) {
              setIsPlaying(false);
              setGameStatus('won');
              playSound('win');
            }
            return matchedCards;
          });
          setFlippedIndices([]);
          setIsLocked(false);
        }, 420);
      } else {
        // ペア不一致（裏に戻す）
        window.setTimeout(() => {
          playSound('mismatch');
          setCards((prevCards) =>
            prevCards.map((c, idx) =>
              idx === firstIdx || idx === secondIdx ? { ...c, isFlipped: false } : c
            )
          );
          setFlippedIndices([]);
          setIsLocked(false);
        }, 850);
      }
    }
  };

  // ゲームリセット
  const resetGame = () => {
    setCards(createShuffledDeck());
    setFlippedIndices([]);
    setMoves(0);
    setTimeLeft(INITIAL_TIME_SECONDS);
    setIsPlaying(false);
    setGameStatus('playing');
    setIsLocked(false);
  };

  // 残り時間の表示フォーマット (M:SS)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const matchedPairsCount = cards.filter((c) => c.isMatched).length / 2;

  return (
    <div className="app-container">
      {/* ヘッダー */}
      <header className="header">
        <div className="title-row">
          <h1 className="game-title">🃏 神経衰弱 4×4</h1>
          <div className="header-controls">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setSoundEnabled((s) => !s)}
              aria-label="効果音切替"
            >
              {soundEnabled ? '🔊 音あり' : '🔇 消音'}
            </button>
            <button type="button" className="icon-btn" onClick={resetGame}>
              🔄 リセット
            </button>
          </div>
        </div>

        <div className="stats-bar">
          <div className="stat-item">
            <span className="stat-label">残り時間</span>
            <span className={`stat-value ${timeLeft <= 30 && gameStatus === 'playing' ? 'warning' : ''}`}>
              {formatTime(timeLeft)}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">ペア数</span>
            <span className="stat-value">{matchedPairsCount} / 8</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">手数</span>
            <span className="stat-value">{moves}回</span>
          </div>
        </div>
      </header>

      {/* 4×4 トランプボード */}
      <main className="board-wrapper">
        <div className="card-grid" role="grid" aria-label="4×4 神経衰弱カード盤面">
          {cards.map((card, index) => (
            <div
              key={card.id}
              role="button"
              tabIndex={0}
              aria-label={
                card.isFlipped || card.isMatched
                  ? `${card.suit}の${card.rank}`
                  : '裏向きのカード'
              }
              className={`card-scene ${card.isFlipped ? 'flipped' : ''} ${
                card.isMatched ? 'matched' : ''
              }`}
              onClick={() => handleCardClick(index)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleCardClick(index);
                }
              }}
            >
              <div className="card-inner">
                {/* 裏面（黄色格子模様） */}
                <div className="card-face card-back" />

                {/* 表面（トランプデザイン） */}
                <div
                  className={`card-face card-front ${
                    card.isRed ? 'suit-red' : 'suit-black'
                  }`}
                >
                  <div className="corner-top">
                    <span className="rank-text">{card.rank}</span>
                    <span className="suit-small">{card.suit}</span>
                  </div>
                  <div className="suit-center">{card.suit}</div>
                  <div className="corner-bottom">
                    <span className="rank-text">{card.rank}</span>
                    <span className="suit-small">{card.suit}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* フッターガイド */}
      <footer className="footer-hint">
        {isPlaying
          ? '同じマークと数字のペアをすべて揃えよう！'
          : 'カードをタップすると5分タイマーがスタートします'}
      </footer>

      {/* クリア・時間切れモーダル */}
      {gameStatus !== 'playing' && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-emoji">
              {gameStatus === 'won' ? '🎉' : '⏰'}
            </div>
            <h2 className="modal-title">
              {gameStatus === 'won' ? 'ゲームクリア！' : 'タイムアップ！'}
            </h2>
            <p className="modal-desc">
              {gameStatus === 'won'
                ? 'すべてのトランプのペアを揃えました！'
                : '制限時間の5分が経過しました。もう一度挑戦しましょう！'}
            </p>
            <div className="modal-stats">
              <div>
                <div className="stat-label" style={{ color: '#64748b' }}>
                  経過時間
                </div>
                <div className="stat-value" style={{ color: '#0f172a' }}>
                  {formatTime(INITIAL_TIME_SECONDS - timeLeft)}
                </div>
              </div>
              <div>
                <div className="stat-label" style={{ color: '#64748b' }}>
                  手数
                </div>
                <div className="stat-value" style={{ color: '#0f172a' }}>
                  {moves}回
                </div>
              </div>
            </div>
            <button type="button" className="primary-btn" onClick={resetGame}>
              もう一度プレイする
            </button>
          </div>
        </div>
      )}
    </div>
  );
}