/**
 * Personality loader
 * Loads personality prompts from personality files
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PERSONALITY_DIR, DEFAULT_PERSONALITY } from "../config/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const personalityRoot = path.join(__dirname, "..", "..", PERSONALITY_DIR);

function parsePersonalityFile(key, fileContents) {
    const lines = fileContents.split(/\r?\n/);
    let name = key.replace(/[-_]/g, " ");
    let prompt = "";
    let collecting = false;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            if (collecting) {
                prompt += "\n";
            }
            continue;
        }

        const lower = line.toLowerCase();
        if (lower.startsWith("name:")) {
            name = line.slice(line.indexOf(":") + 1).trim();
            continue;
        }

        if (lower.startsWith("prompt:")) {
            collecting = true;
            const text = line.slice(line.indexOf(":") + 1).trim();
            if (text) {
                prompt += `${text}\n`;
            }
            continue;
        }

        if (collecting) {
            prompt += `${line}\n`;
        }
    }

    if (!prompt) {
        prompt = lines
            .filter(
                (rawLine) => !rawLine.trim().toLowerCase().startsWith("name:"),
            )
            .join("\n")
            .trim();
    }

    return {
        key,
        name,
        prompt: prompt.trim(),
    };
}

export function loadPersonalities() {
    if (!fs.existsSync(personalityRoot)) {
        return {
            [DEFAULT_PERSONALITY]: {
                key: DEFAULT_PERSONALITY,
                name: "Friendly",
                prompt: "You are Friendly, a warm, thoughtful, and easygoing assistant.",
            },
        };
    }

    const files = fs.readdirSync(personalityRoot);
    const personalities = {};

    for (const file of files) {
        if (!file.endsWith(".txt")) continue;
        const key = path.basename(file, ".txt");
        const fileContents = fs.readFileSync(
            path.join(personalityRoot, file),
            "utf-8",
        );
        personalities[key] = parsePersonalityFile(key, fileContents);
    }

    if (
        !personalities[DEFAULT_PERSONALITY] &&
        Object.keys(personalities).length > 0
    ) {
        const firstKey = Object.keys(personalities)[0];
        Object.defineProperty(personalities, DEFAULT_PERSONALITY, {
            value: personalities[firstKey],
            enumerable: false,
            configurable: true,
            writable: false,
        });
    }

    const legacyDefaultKey = DEFAULT_PERSONALITY.toLowerCase();
    if (
        legacyDefaultKey !== DEFAULT_PERSONALITY &&
        !personalities[legacyDefaultKey] &&
        personalities[DEFAULT_PERSONALITY]
    ) {
        Object.defineProperty(personalities, legacyDefaultKey, {
            value: personalities[DEFAULT_PERSONALITY],
            enumerable: false,
            configurable: true,
            writable: false,
        });
    }

    return personalities;
}
