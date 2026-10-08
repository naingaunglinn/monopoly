import { useEffect } from 'react';
import { GameScreen } from './screens/GameScreen';
import { LobbyScreen, OnlineEntryScreen } from './screens/OnlineScreens';
import { SetupScreen } from './screens/SetupScreen';
import { StartScreen } from './screens/StartScreen';
import { RuleGuide } from './overlays/RuleGuide';
import { RotateHint } from './components/RotateHint';
import { usePrefs } from './prefs';
import { openRoom } from './session/online';
import { ROOM_PARAM, useAnimationSpeed, useApp, useUi } from './store';
import { Toast } from './overlays/Overlays';

let openedRoomParam = false;

export function App() {
  const { screen, game } = useApp();
  const animationSpeed = useAnimationSpeed();
  const { rules } = useUi();
  const { motionAnyway } = usePrefs();
  // An invite link (?room=ABCD) opens that room once, at load.
  useEffect(() => {
    if (!ROOM_PARAM || openedRoomParam) return;
    openedRoomParam = true;
    void openRoom(ROOM_PARAM.trim().toUpperCase());
  }, []);
  // The speed setting applies to everything on screen, including overlays outside the board.
  const speed = screen === 'game' && game ? animationSpeed : 'normal';
  return (
    <div className="app" data-speed={speed} data-motion={motionAnyway ? 'full' : undefined}>
      {screen === 'start' && <StartScreen />}
      {screen === 'setup' && <SetupScreen />}
      {screen === 'online' && <OnlineEntryScreen />}
      {screen === 'lobby' && <LobbyScreen />}
      {screen === 'game' && game && <GameScreen />}
      {rules.open && <RuleGuide />}
      {/* One toast for every screen (game, lobby, start). */}
      <Toast />
      <RotateHint />
    </div>
  );
}
