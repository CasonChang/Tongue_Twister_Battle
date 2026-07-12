import { useState } from 'react';
import { HomePage } from './HomePage';
import { PracticePage } from './PracticePage';

type Screen = { name: 'home' } | { name: 'practice' };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });

  return (
    <div className="app">
      <h1 className="title">繞口令 Battle</h1>
      {screen.name === 'home' && (
        <HomePage onStartPractice={() => setScreen({ name: 'practice' })} />
      )}
      {screen.name === 'practice' && <PracticePage onExit={() => setScreen({ name: 'home' })} />}
    </div>
  );
}
