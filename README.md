# Living Arweave Data Sculpture

A real-time generative art installation that visualizes the Arweave blockchain as a living, breathing data sculpture. Each new transaction on the Arweave network creates particles and energy flows in the visualization, making it a truly dynamic piece of art that evolves with the permaweb.

## Features

- **Real-time Blockchain Monitoring**: Continuously monitors the Arweave network for new blocks and transactions
- **Generative Visualization**: Uses p5.js to create dynamic, particle-based visualizations
- **WebSocket Communication**: Real-time data streaming between backend and frontend
- **Interactive Controls**: Pause, reset, and fullscreen controls
- **Transaction Feed**: Live feed of recent transactions with details
- **Network Energy Visualization**: Central pulse and connection network that responds to blockchain activity

## Installation

1. Clone or download the project
2. Navigate to the project directory:
   ```bash
   cd arweave-sculpture
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

## Usage

1. Start the server:
   ```bash
   npm start
   ```
   
   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

2. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

3. The sculpture will automatically connect to the Arweave network and begin visualizing new transactions as they occur.

## How It Works

### Backend (server.js)
- Polls the Arweave network every 10 seconds for new blocks
- Fetches transaction details for visualization
- Broadcasts new transaction data to connected clients via WebSocket

### Frontend (sculpture.js)
- Receives transaction data via WebSocket
- Creates particle systems representing transactions
- Renders dynamic visualizations using p5.js
- Displays real-time network statistics and transaction feed

### Visualization Elements
- **Particles**: Each transaction becomes a particle with size based on data size
- **Connection Network**: Background network that pulses with activity
- **Central Energy Core**: Rotating rings that intensify with network activity
- **Color Coding**: Neon pink theme with dynamic color variations

## Controls

- **Pause/Resume**: Pause the animation while keeping data collection active
- **Reset**: Clear all particles and reset counters
- **Fullscreen**: Enter fullscreen mode for immersive viewing

## Technical Details

- **Framework**: Node.js with Express
- **Visualization**: p5.js creative coding library
- **Real-time Communication**: WebSockets (ws library)
- **Data Source**: Arweave network via public API
- **Styling**: Custom CSS with glassmorphism effects

## Customization

The visualization can be customized by modifying:
- Color palette in `sculpture.js`
- Particle behavior and physics
- Network polling interval in `server.js`
- UI layout and styling in `index.html`

## Inspiration

This project is inspired by the work of generative artists like Refik Anadol, who use data as a creative medium to create "machine dreams" and living artworks that evolve with their data sources.

## License

MIT License - Feel free to use and modify for your own projects!
