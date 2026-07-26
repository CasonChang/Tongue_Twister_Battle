// 站內計分說明（玩家看的版本）。完整技術規格見 docs/04-scoring.md。
import { balance } from '@shared/balance';
import { ITEMS, ALL_ITEM_IDS } from '@shared/items';

export function HelpPage({ onExit }: { onExit: () => void }) {
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  return (
    <>
      <button className="back" onClick={onExit}>
        ← 返回首頁
      </button>

      <div className="card help">
        <h2>怎麼算分？</h2>
        <p>
          系統會把你唸的內容跟題目<b>逐字比對</b>，每個字給一個顏色，加總換算成 0–100% 的正確率，
          再換算成打在對方身上的傷害。
        </p>

        <h3>三色標記</h3>
        <table className="help-table">
          <tbody>
            <tr>
              <td>
                <span className="mark-green">■</span> 綠
              </td>
              <td>字對、音也對</td>
              <td className="score">1 分</td>
            </tr>
            <tr>
              <td>
                <span className="mark-yellow">■</span> 黃
              </td>
              <td>
                字對但音不準──<b>聲調錯</b>，或屬於常見口音（平翹舌、n/l、前後鼻音不分）；
                英文則是同音詞（sea/see）
              </td>
              <td className="score">{balance.toneWrongScore} 分</td>
            </tr>
            <tr>
              <td>
                <span className="mark-gray">■</span> 灰
              </td>
              <td>唸錯、漏唸</td>
              <td className="score">0 分</td>
            </tr>
          </tbody>
        </table>

        <h3>多唸也會扣分</h3>
        <p>
          唸出題目裡沒有的字，每個扣 <b>{balance.insertionPenalty} 分</b>。
          例如「紅鳳凰」唸成「<b>粉</b>紅鳳凰」→ 三個字雖然都對，但多唸一個字，
          最後是 {pct(2.5 / 3)} 而不是 100%。
        </p>

        <h3>正確率</h3>
        <p className="formula">
          正確率 =（三色得分總和 − 多唸字數 × {balance.insertionPenalty}）÷ 題目字數
        </p>
        <p>
          達到 <b>{pct(balance.perfectThreshold)}</b> 以上就是 <span className="tag perfect">PERFECT</span>。
        </p>

        <h3>傷害怎麼算</h3>
        <p className="formula">
          傷害 = {balance.baseDamage} × 正確率² ＋ 早唸完加成（最多 {balance.timeBonusMax}）
          ＋ 完美加成 {balance.perfectBonus}
        </p>
        <p>
          用<b>正確率的平方</b>，所以唸得好差距會拉開，搶快亂唸沒有好處。
          「早唸完加成」是依你<b>最後一次出聲</b>的時間算的，早唸完自然有加成——
          這就是為什麼兩個人同樣 100%，傷害卻可能差 1、2 點。成績卡會列出組成。
        </p>

        <h3>勝負判定</h3>
        <p>
          雙方初始 <b>{balance.playerHp} HP</b>，<b>血量可以是負數</b>。
          一回合兩人各唸同一題一次，先攻一唸完就立刻扣血；
          <b>就算後攻已經被打到 0 以下，他仍然可以完成最後一擊</b>。
        </p>
        <ul>
          <li>只有一方 HP ≤ 0 → 另一方獲勝</li>
          <li>
            <b>兩人同時 ≤ 0（雙殺）</b> → 比<b>全場加權平均正確率</b>（以造成的傷害為權重），
            高者獲勝。此時血量多寡<b>不影響</b>勝負
          </li>
          <li>雙殺且差距在 {pct(balance.drawThreshold)} 以內 → 平手</li>
        </ul>

        <h3>道具</h3>
        <p>
          開局每人拿到四種各一個，兩邊完全一樣。每回合開場有 {balance.roundIntroSec} 秒可以選一個，
          這時<b>題目已經公開</b>，可以看題再決定。
        </p>
        <table className="help-table">
          <tbody>
            {ALL_ITEM_IDS.map((id) => {
              const it = ITEMS[id];
              return (
                <tr key={id}>
                  <td className="nowrap">
                    {it.emoji} {it.name}
                  </td>
                  <td colSpan={2}>{it.desc}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p>
          🧛 吸血搭配可負血量就是<b>翻盤機制</b>：被打到 −8 時吸血打出 20 傷害就能回到 +12 活下來，
          但只打出 8 就還是陣亡。吸得回來是實力，因為吸多少取決於你唸得多好。
        </p>

        <h3>需要知道的限制</h3>
        <ul>
          <li>
            請用 <b>Chrome 或 Edge</b>。語音辨識在雲端進行、需要網路；
            Brave 與 Firefox 會擋住或不支援。
          </li>
          <li>
            辨識引擎會<b>自動把聽到的音修正成通順的詞</b>（「會發黑」被改成「揮發」）。
            系統已經會向引擎索取多組候選、挑最接近題目的那組來救，但無法完全避免。
          </li>
        </ul>
      </div>

      <button className="btn big secondary" onClick={onExit}>
        返回首頁
      </button>
    </>
  );
}
