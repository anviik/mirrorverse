import React from "react";
import { Text } from "react-native";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";

import HomeScreen from "./screens/HomeScreen";
import CreateDecisionScreen from "./screens/CreateDecisionScreen";
import GraphScreen from "./screens/GraphScreen";
import ResultsScreen from "./screens/ResultsScreen";
import InsightsScreen from "./screens/InsightsScreen";
import { colors } from "./lib/theme";

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function HomeTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.cardBorder,
        },
        tabBarActiveTintColor: colors.purple,
        tabBarInactiveTintColor: colors.textDim,
      }}
    >
      <Tabs.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>◈</Text> }}
      />
      <Tabs.Screen
        name="Insights"
        component={InsightsScreen}
        options={{ tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>✦</Text> }}
      />
    </Tabs.Navigator>
  );
}

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.card,
    text: colors.text,
    primary: colors.purple,
    border: colors.cardBorder,
  },
};

export default function App() {
  return (
    <NavigationContainer theme={theme}>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="Tabs" component={HomeTabs} options={{ headerShown: false }} />
        <Stack.Screen
          name="Create"
          component={CreateDecisionScreen}
          options={{ title: "New Decision" }}
        />
        <Stack.Screen name="Graph" component={GraphScreen} options={{ title: "Decision Graph" }} />
        <Stack.Screen
          name="Results"
          component={ResultsScreen}
          options={{ title: "Simulation Results" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
