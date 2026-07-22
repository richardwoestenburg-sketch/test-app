// Registry van alle mini-apps: naam, kleur, icoon en omschrijving.
// Wordt gebruikt door het startscherm en de standalone-modus (App.jsx) en
// door scripts/generate-app-assets.mjs, dat hieruit de per-app manifesten
// en iconen genereert (npm run gen:apps na een wijziging hier).
//
// `accent` is de hoofdkleur (knoppen, accenten), `bright` de lichtere
// gradient-partner ervan.
import {
  BookOpen, CalendarDays, Timer, Images, Camera, Car, Wrench, Box,
  AudioLines, UserRound,
} from "lucide-react";

export const APPS = [
  { key: "log", name: "Daglog", tagline: "journaal van je uren", icon: BookOpen, accent: "#4f46e5", bright: "#818cf8" },
  { key: "agenda", name: "Agenda", tagline: "plannen mét melding", icon: CalendarDays, accent: "#e11d48", bright: "#fb7185" },
  { key: "tijd", name: "Tijd", tagline: "tijdregistratie per dag", icon: Timer, accent: "#d97706", bright: "#fbbf24" },
  { key: "vakantie", name: "Vakantie", tagline: "fototijdlijn van je reis", icon: Images, accent: "#0d9488", bright: "#2dd4bf" },
  { key: "flitsers", name: "Flitsers", tagline: "waarschuwt voor flitspalen", icon: Camera, accent: "#ea580c", bright: "#fb923c" },
  { key: "cabrio", name: "Cabrio", tagline: "kap open of dicht?", icon: Car, accent: "#0284c7", bright: "#38bdf8" },
  { key: "garage", name: "Garage", tagline: "onderhoud & detailing", icon: Wrench, accent: "#7c3aed", bright: "#a78bfa" },
  { key: "afbeeldingen", name: "Afbeeldingen", tagline: "3D-renders genereren", icon: Box, accent: "#16a34a", bright: "#4ade80" },
  { key: "stem", name: "Stem", tagline: "jouw stem, gekloond", icon: AudioLines, accent: "#db2777", bright: "#f472b6" },
  { key: "secretaresse", name: "Secretaresse", tagline: "mail & Outlook-agenda", icon: UserRound, accent: "#a16207", bright: "#eab308" },
];

export function findApp(key) {
  return APPS.find((a) => a.key === key) || null;
}
