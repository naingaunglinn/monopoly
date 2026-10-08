import { GameScreen } from './screens/GameScreen';
import { SetupScreen } from './screens/SetupScreen';
import { StartScreen } from './screens/StartScreen';
import { RuleGuide } from './overlays/RuleGuide';
import { RotateHint } from './components/RotateHint';
import { usePrefs } from './prefs';
import { useApp, useUi } from './store';

export function App() {
  const { screen, game } = useApp();
  const { rules } = useUi();
  const { motionAnyway } = usePrefs();
  // The speed setting applies to everything on screen, including overlays outside the board.
  const speed = screen === 'game' && game ? game.meta.settings.animationSpeed : 'normal';
  return (
    <div className="app" data-speed={speed} data-motion={motionAnyway ? 'full' : undefined}>
      {screen === 'start' && <StartScreen />}
      {screen === 'setup' && <SetupScreen />}
      {screen === 'game' && game && <GameScreen />}
      {rules.open && <RuleGuide />}
      <RotateHint />
    </div>
  );
}
