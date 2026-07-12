import type { CharMark } from '../game/types';

/** 逐字三色顯示（docs/01 §3.1）：綠＝字對音對、黃＝字對音錯、灰＝全錯。 */
export function CharMarksView({ marks }: { marks: CharMark[] }) {
  return (
    <div className="marks">
      {marks.map((m, i) => (
        <span key={i} className={`mark-${m.mark}`} title={m.heard ? `聽成：${m.heard}` : '沒聽到'}>
          {m.char}
        </span>
      ))}
    </div>
  );
}

export function MarksLegend() {
  return (
    <div className="legend">
      <span className="mark-green">■ 字對音對</span>
      <span className="mark-yellow">■ 字對音錯</span>
      <span className="mark-gray">■ 錯/漏</span>
    </div>
  );
}
