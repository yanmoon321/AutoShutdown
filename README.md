# AutoShutdown

AutoShutdown is a modern, lightweight desktop application designed to manage automatic shutdown tasks for specific applications and your system. Built with Tauri, React, and Rust, it offers high performance and a sleek user interface.

## 💡 Why AutoShutdown?

> *Note: I originally built this tool for my own use because I needed a sleep timer for listening to music at night, but I hope it helps others too.*

**Ever wanted a "Sleep Timer" for your PC music player?**

Many desktop applications, especially music and video players, surprisingly lack a built-in auto-stop feature. If you enjoy falling asleep to music, you shouldn't have to leave your computer (or the app) running all night.

**AutoShutdown acts as a universal sleep timer**, allowing you to schedule the closing of **any** specific app (like Spotify, YouTube in a browser, or local players) exactly when you want. It solves the simple problem: "I want this music app to quit in 30 minutes."

## ✨ Features

- **App Auto-Shutdown**: Automatically close specific applications after a countdown.
- **System Power Actions**: Schedule system Shutdown, Restart, or Sleep.
- **Smart Detection**: Automatically detects running applications with real icons and window titles.
- **Modern UI**: Clean interface with automatic Light/Dark mode switching.
- **High Performance**: Built on Tauri (Rust) for minimal resource usage (approx. 5MB).
- **Multi-language**: Auto-detects System Language (English / Chinese).

## 🚀 Installation

1. Go to the [Releases](https://github.com/YOUR_USERNAME/AutoShutdown/releases) page.
2. Download the latest installer (`.exe` or `.msi`).
3. Run the installer and follow the instructions.

## 🛠️ Development

### Prerequisites
- Node.js (v16+)
- Rust (latest stable)

### Build from Source

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/AutoShutdown.git
   cd AutoShutdown
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run tauri dev
   ```

4. Build for production:
   ```bash
   npm run tauri build
   ```

## 🏗️ Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Vite
- **Backend**: Rust, Tauri
- **System API**: Windows API (Win32)

## 📄 License

MIT License
