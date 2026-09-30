#!/bin/bash
# Fabrexa AI Bot - Linux/macOS startup script

echo ""
echo "============================================================"
echo "  Fabrexa AI - Telegram Bot"
echo "  Powered by local Ollama models"
echo "============================================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
    echo "Node.js is not installed."
    echo "Install Node.js from https://nodejs.org/"
    exit 1
fi

echo "Node.js found: $(node --version)"

if ! command -v npm >/dev/null 2>&1; then
    echo "npm is not installed."
    exit 1
fi

echo "npm found: $(npm --version)"

if [ ! -f ".env" ]; then
    echo ""
    echo ".env file not found."
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo ""
    echo "Edit .env and set:"
    echo "   - TELEGRAM_BOT_TOKEN"
    echo "   - OWNER_ID"
    echo "   - OWNER_USERNAME"
    echo "   - OLLAMA_MODEL"
    echo ""
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo ""
    echo "Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "Failed to install dependencies."
        exit 1
    fi
fi

echo ""
echo "Starting Fabrexa AI Bot..."
echo "Make sure Ollama is running: ollama serve"
echo ""
npm start
