import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { GameProvider } from './context/GameContext';

import LoginScreen from './screens/LoginScreen';
import TownScreen from './screens/TownScreen';
import DungeonScreen from './screens/DungeonScreen';
import CharacterScreen from './screens/CharacterScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <GameProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <Stack.Navigator
          initialRouteName="Login"
          screenOptions={{
            headerStyle: { backgroundColor: '#1a0a2e' },
            headerTintColor: '#ffd700',
            headerTitleStyle: { fontWeight: 'bold' },
            contentStyle: { backgroundColor: '#0d0618' },
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Town" component={TownScreen} options={{ title: '마을' }} />
          <Stack.Screen name="Dungeon" component={DungeonScreen} options={{ title: '던전' }} />
          <Stack.Screen name="Character" component={CharacterScreen} options={{ title: '캐릭터' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </GameProvider>
  );
}
