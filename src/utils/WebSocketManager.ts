// WebSocket Connection Manager für Single Connection per Client
class WebSocketManager {
  private static instance: WebSocketManager;
  private activeConnection: WebSocket | null = null;
  private connectionPromise: Promise<WebSocket> | null = null;
  private lastConnectAttempt: number = 0;
  private readonly MIN_CONNECT_INTERVAL = 2000; // 2 Sekunden zwischen Verbindungen

  private constructor() {}

  public static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  public async connect(url: string): Promise<WebSocket> {
    // Rate limiting
    const now = Date.now();
    if (now - this.lastConnectAttempt < this.MIN_CONNECT_INTERVAL) {
      console.log('🕐 WebSocket Manager: Rate limit - warte vor nächstem Verbindungsversuch');
      throw new Error('Rate limit: Zu früh für neue Verbindung');
    }

    // Prüfe bestehende Verbindung
    if (this.activeConnection?.readyState === WebSocket.OPEN) {
      console.log('🔗 WebSocket Manager: Verwende bestehende Verbindung');
      return this.activeConnection;
    }

    // Prüfe laufende Verbindung
    if (this.connectionPromise) {
      console.log('🔗 WebSocket Manager: Warte auf laufende Verbindung');
      return this.connectionPromise;
    }

    this.lastConnectAttempt = now;

    // Neue Verbindung erstellen
    console.log('🔗 WebSocket Manager: Erstelle neue Verbindung zu', url);
    this.connectionPromise = new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      
      const cleanup = () => {
        this.connectionPromise = null;
        if (this.activeConnection === ws) {
          this.activeConnection = null;
        }
      };

      ws.onopen = () => {
        console.log('✅ WebSocket Manager: Verbindung erfolgreich');
        this.activeConnection = ws;
        this.connectionPromise = null;
        resolve(ws);
      };

      ws.onclose = (event) => {
        console.log(`🔌 WebSocket Manager: Verbindung geschlossen (${event.code}: ${event.reason})`);
        cleanup();
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket Manager: Verbindungsfehler', error);
        cleanup();
        reject(error);
      };

      // Timeout nach 10 Sekunden
      setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close();
          cleanup();
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);
    });

    return this.connectionPromise;
  }

  public disconnect(): void {
    if (this.activeConnection) {
      console.log('🔌 WebSocket Manager: Schließe aktive Verbindung');
      this.activeConnection.close(1000, 'Manager disconnect');
      this.activeConnection = null;
    }
    this.connectionPromise = null;
  }

  public getActiveConnection(): WebSocket | null {
    return this.activeConnection?.readyState === WebSocket.OPEN ? this.activeConnection : null;
  }

  public isConnected(): boolean {
    return this.activeConnection?.readyState === WebSocket.OPEN || false;
  }

  public isConnecting(): boolean {
    return this.connectionPromise !== null || this.activeConnection?.readyState === WebSocket.CONNECTING || false;
  }
}

export default WebSocketManager;