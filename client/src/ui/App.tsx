import { useState } from 'react';
import { HomePage } from './HomePage';
import { PracticePage } from './PracticePage';
import { BattlePage } from './BattlePage';
import { HelpPage } from './HelpPage';
import { OnlinePage } from './OnlinePage';

type Screen = { name: 'home' } | { name: 'practice' } | { name: 'battle' } | { name: 'help' }
  | { name: 'online' };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const home = () => setScreen({ name: 'home' });

  return (
    <div className="app">
      <h1 className="title">繞口令 Battle</h1>
      {screen.name === 'home' && (
        <HomePage
          onStartPractice={() => setScreen({ name: 'practice' })}
          onStartBattle={() => setScreen({ name: 'battle' })}
          onOpenHelp={() => setScreen({ name: 'help' })}
          onStartOnline={() => setScreen({ name: 'online' })}
        />
      )}
      {screen.name === 'practice' && <PracticePage onExit={home} />}
      {screen.name === 'battle' && <BattlePage onExit={home} />}
      {screen.name === 'help' && <HelpPage onExit={home} />}
      {screen.name === 'online' && <OnlinePage onExit={home} />}
    </div>
  );
}
