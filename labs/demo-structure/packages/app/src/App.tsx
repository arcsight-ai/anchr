import { getClient } from "@demo/api";
import { Header } from "./components/Header.js";

export function App(): string {
  getClient();
  return Header();
}
