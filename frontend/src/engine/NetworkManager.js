/**
 * NetworkManager – WebSocket client for multiplayer synchronisation.
 *
 * Usage:
 *   const net = new NetworkManager();
 *   net.connect('room1', 'player_abc', 'Alice');
 *   net.sendUpdate({ x, y, z }, { y: yaw }, health);
 *   net.disconnect();
 */

export class NetworkManager {
  constructor() {
    this.ws = null;
    this.playerId = null;
    this.roomId = null;
    this.username = null;
    this._connected = false;
    this._reconnectTimer = null;
    this._destroyed = false;

    /** Map of remote player states keyed by player_id */
    this.remotePlayers = new Map();

    // Callbacks – assign before calling connect()
    this.onRoomState = null;        // (players[]) initial room state
    this.onPlayerJoined = null;     // (player)
    this.onPlayerUpdated = null;    // (player_id, position, rotation, health)
    this.onPlayerLeft = null;       // (player_id)
    this.onShootEvent = null;       // ({ player_id, origin, direction })
    this.onDamageEvent = null;      // ({ target_id, attacker_id, amount, health })
    this.onRespawnEvent = null;     // ({ player_id, position })
    this.onChatMessage = null;      // ({ player_id, username, text })
    this.onConnected = null;        // ()
    this.onDisconnected = null;     // ()
  }

  // ---------------------------------------------------------------------------

  connect(roomId, playerId, username) {
    this.roomId = roomId;
    this.playerId = playerId;
    this.username = username;
    this._destroyed = false;
    this._openSocket();
  }

  disconnect() {
    this._destroyed = true;
    clearTimeout(this._reconnectTimer);
    if (this.ws) {
      if (this._connected) {
        this._send({ type: 'leave', player_id: this.playerId });
      }
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }

  // ---------------------------------------------------------------------------

  sendUpdate(position, rotation, health) {
    this._send({ type: 'update', player_id: this.playerId, position, rotation, health });
  }

  sendShoot(origin, direction) {
    this._send({ type: 'shoot', player_id: this.playerId, origin, direction });
  }

  sendDamage(targetId, amount) {
    this._send({ type: 'damage', target_id: targetId, amount, attacker_id: this.playerId });
  }

  sendRespawn(position) {
    this._send({ type: 'respawn', player_id: this.playerId, position });
  }

  sendChat(text) {
    this._send({ type: 'chat', player_id: this.playerId, username: this.username, text });
  }

  get isConnected() { return this._connected; }

  get playerCount() { return this.remotePlayers.size + 1; }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  _openSocket() {
    if (this._destroyed) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/api/multiplayer/ws/${this.roomId}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this._connected = true;
      this._send({
        type: 'join',
        room_id: this.roomId,
        player_id: this.playerId,
        username: this.username,
      });
      if (this.onConnected) this.onConnected();
    };

    this.ws.onmessage = (evt) => {
      try {
        this._handleMessage(JSON.parse(evt.data));
      } catch (_) {}
    };

    this.ws.onclose = () => {
      this._connected = false;
      if (this.onDisconnected) this.onDisconnected();
      if (!this._destroyed) {
        this._reconnectTimer = setTimeout(() => this._openSocket(), 3000);
      }
    };

    this.ws.onerror = () => {};
  }

  _send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'room_state': {
        this.remotePlayers.clear();
        (msg.players || []).forEach(p => {
          if (p.player_id !== this.playerId) {
            this.remotePlayers.set(p.player_id, { ...p });
          }
        });
        if (this.onRoomState) this.onRoomState(Array.from(this.remotePlayers.values()));
        break;
      }
      case 'player_joined': {
        const p = msg.player;
        if (p && p.player_id !== this.playerId) {
          this.remotePlayers.set(p.player_id, { ...p });
          if (this.onPlayerJoined) this.onPlayerJoined({ ...p });
        }
        break;
      }
      case 'player_update': {
        const pid = msg.player_id;
        if (pid && pid !== this.playerId) {
          const existing = this.remotePlayers.get(pid) || {};
          const updated = {
            ...existing,
            player_id: pid,
            position: msg.position ?? existing.position,
            rotation: msg.rotation ?? existing.rotation,
            health: msg.health ?? existing.health,
          };
          this.remotePlayers.set(pid, updated);
          if (this.onPlayerUpdated) this.onPlayerUpdated(pid, updated.position, updated.rotation, updated.health);
        }
        break;
      }
      case 'player_left': {
        this.remotePlayers.delete(msg.player_id);
        if (this.onPlayerLeft) this.onPlayerLeft(msg.player_id);
        break;
      }
      case 'shoot_event': {
        if (this.onShootEvent) this.onShootEvent(msg);
        break;
      }
      case 'damage_event': {
        if (this.onDamageEvent) this.onDamageEvent(msg);
        break;
      }
      case 'respawn_event': {
        if (msg.player_id !== this.playerId) {
          const p = this.remotePlayers.get(msg.player_id);
          if (p) { p.position = msg.position; p.health = 100; }
        }
        if (this.onRespawnEvent) this.onRespawnEvent(msg);
        break;
      }
      case 'chat_message': {
        if (this.onChatMessage) this.onChatMessage(msg);
        break;
      }
      default: break;
    }
  }
}
