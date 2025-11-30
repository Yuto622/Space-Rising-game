import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

// --- Constants & Config ---
// Super slow physics for "deep space/moon" feel
const GRAVITY = 0.08; 
const JUMP_FORCE = -6.0; 
const SUPER_JUMP_FORCE = -10.0; 
const FRICTION = 0.98; // Very slippery (vacuum)
const ACCEL = 0.15; // Slightly more control than before (was 0.12)
const SCREEN_WRAP = true;

const COLORS = {
  backgroundTop: '#050510',
  backgroundBottom: '#1a0b2e',
  player: '#ffffff',
  playerEngine: '#00f2ff',
  text: '#ffffff',
  uiOverlay: 'rgba(0, 0, 0, 0.85)',
};

// --- Sound Synthesizer ---
const sfx = {
  ctx: null as AudioContext | null,
  init: () => {
    if (!sfx.ctx) {
      sfx.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (sfx.ctx.state === 'suspended') {
      sfx.ctx.resume();
    }
  },
  play: (type: 'JUMP' | 'BOOST' | 'DOUBLE_JUMP' | 'EXPLOSION' | 'POWERUP' | 'GAME_OVER' | 'BREAK') => {
    if (!sfx.ctx) return;
    const ctx = sfx.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    const now = ctx.currentTime;

    switch (type) {
      case 'JUMP':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.2);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      case 'BOOST':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.8); // Longer sound
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);
        break;
      case 'DOUBLE_JUMP':
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.2);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      case 'POWERUP':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1760, now + 0.1);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      case 'EXPLOSION': // Simple low rumble
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.8);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);
        break;
      case 'BREAK':
        osc.type = 'square';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      case 'GAME_OVER':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(30, now + 2.0);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 2.0);
        osc.start(now);
        osc.stop(now + 2.0);
        break;
    }
  }
};

// --- Types ---
type Vector = { x: number; y: number };
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};
type PlatformType = 'NORMAL' | 'BOOST' | 'DOUBLE_JUMP_CHARGER' | 'MOVING' | 'BREAKABLE' | 'PHANTOM' | 'SHRINKING' | 'START';
type ObstacleType = 'UFO' | 'BLACK_HOLE';

class Obstacle {
    x: number;
    y: number;
    radius: number;
    type: ObstacleType;
    vx: number = 0;
    angle: number = 0;

    constructor(x: number, y: number, type: ObstacleType) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.angle = Math.random() * Math.PI * 2;

        if (type === 'UFO') {
            this.radius = 25;
            this.vx = (Math.random() - 0.5) * 0.5; // Very slow UFO
        } else {
            this.radius = 40; // Black hole event horizon size roughly
        }
    }

    update(width: number, player: Player) {
        this.angle += 0.02; // Slower animation

        if (this.type === 'UFO') {
            this.x += this.vx;
            // Hover effect
            this.y += Math.sin(this.angle) * 0.2;

            // Bounce off walls
            if (this.x < this.radius) {
                this.x = this.radius;
                this.vx *= -1;
            }
            if (this.x > width - this.radius) {
                this.x = width - this.radius;
                this.vx *= -1;
            }
        }
        // Black holes are stationary but exert gravity (handled in main loop)
    }

    draw(ctx: CanvasRenderingContext2D, time: number) {
        ctx.save();
        ctx.translate(this.x, this.y);

        if (this.type === 'UFO') {
            // Hover wobble
            const wobble = Math.sin(time * 0.002) * 4;
            ctx.translate(0, wobble);

            // Dome
            ctx.fillStyle = 'rgba(100, 255, 255, 0.6)';
            ctx.beginPath();
            ctx.arc(0, -5, 12, Math.PI, 0);
            ctx.fill();

            // Body
            const grad = ctx.createLinearGradient(-25, 0, 25, 0);
            grad.addColorStop(0, '#555');
            grad.addColorStop(0.5, '#ccc');
            grad.addColorStop(1, '#555');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.ellipse(0, 0, 25, 10, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Lights
            for(let i=0; i<5; i++) {
                const angle = (time * 0.002) + (i * (Math.PI * 2) / 5);
                const lx = Math.cos(angle) * 18;
                const ly = Math.sin(angle) * 4;
                // Only draw front lights
                if (Math.sin(angle) > 0) {
                     ctx.fillStyle = i % 2 === 0 ? '#ff0000' : '#ffff00';
                     ctx.beginPath();
                     ctx.arc(lx, ly + 2, 3, 0, Math.PI * 2);
                     ctx.fill();
                }
            }
            
            // Beam (faint)
            ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
            ctx.beginPath();
            ctx.moveTo(-10, 5);
            ctx.lineTo(-20, 40);
            ctx.arc(0, 40, 20, 0, Math.PI, false); // Bottom arc
            ctx.lineTo(20, 40);
            ctx.lineTo(10, 5);
            ctx.fill();

        } else if (this.type === 'BLACK_HOLE') {
            // Event Horizon
            ctx.fillStyle = '#000';
            ctx.shadowColor = '#8000ff';
            ctx.shadowBlur = 20 + Math.sin(time * 0.005) * 10;
            ctx.beginPath();
            ctx.arc(0, 0, 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Accretion Disk (Swirling)
            ctx.rotate(time * 0.0005);
            const grad = ctx.createRadialGradient(0, 0, 15, 0, 0, 50);
            grad.addColorStop(0, 'rgba(128, 0, 255, 0.8)');
            grad.addColorStop(0.4, 'rgba(255, 0, 128, 0.3)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            
            ctx.fillStyle = grad;
            ctx.beginPath();
            // Irregular swirl shape
            for(let i=0; i<=20; i++) {
                const angle = (i / 20) * Math.PI * 2;
                const r = 40 + Math.sin(angle * 5 + time * 0.005) * 5;
                const x = Math.cos(angle) * r;
                const y = Math.sin(angle) * r;
                if (i===0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
    }
}

class Platform {
  x: number;
  y: number;
  radius: number;
  type: PlatformType;
  id: number;
  visualOffset: number; // For floating animation
  vx: number = 0;
  broken: boolean = false;
  // For Phantom
  phantomPhase: number = 0;
  opacity: number = 1.0;
  // For Shrinking
  shrinkRate: number = 0.05;
  
  // Visual specific properties
  rotationAngle: number = 0;
  visualSeed: number;
  craters: {x: number, y: number, r: number}[] = [];
  stripes: {y: number, w: number}[] = [];
  techLines: {x: number, y: number, len: number, angle: number}[] = [];

  constructor(x: number, y: number, type: PlatformType) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.id = Math.random();
    this.visualOffset = Math.random() * Math.PI * 2;
    this.phantomPhase = Math.random() * Math.PI * 2;
    this.visualSeed = Math.random();
    this.rotationAngle = Math.random() * Math.PI * 2;

    // Type specific config & Visual Gen
    switch (type) {
      case 'NORMAL':
        this.radius = 35; // Larger (Easier)
        // Ice patches
        for (let i = 0; i < 3; i++) {
           this.craters.push({
               x: (Math.random() - 0.5) * 20,
               y: (Math.random() - 0.5) * 20,
               r: Math.random() * 8 + 5
           });
        }
        break;
      case 'START':
        this.radius = 120; // Very wide
        break;
      case 'BOOST':
        this.radius = 30; // Larger (Easier)
        // Gas giant stripes
        for (let i = 0; i < 4; i++) {
            this.stripes.push({
                y: (Math.random() - 0.5) * 40,
                w: Math.random() * 5 + 3
            });
        }
        break;
      case 'DOUBLE_JUMP_CHARGER':
        this.radius = 25; // Larger (Easier)
        break;
      case 'MOVING':
        this.radius = 32;
        this.vx = (Math.random() > 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.3); // Very Slower movement
        // Tech lines
        for(let i=0; i<6; i++) {
            this.techLines.push({
                x: (Math.random() - 0.5) * 30,
                y: (Math.random() - 0.5) * 30,
                len: Math.random() * 15 + 5,
                angle: Math.floor(Math.random() * 4) * (Math.PI / 2)
            });
        }
        break;
      case 'BREAKABLE':
        this.radius = 32;
        // Craters
        for (let i = 0; i < 4; i++) {
            this.craters.push({
                x: (Math.random() - 0.5) * 25,
                y: (Math.random() - 0.5) * 25,
                r: Math.random() * 6 + 2
            });
        }
        break;
      case 'PHANTOM':
        this.radius = 32;
        break;
      case 'SHRINKING':
        this.radius = 40; // Start larger (Easier)
        this.shrinkRate = 0.005 + Math.random() * 0.005; // Very Slower shrinking
        break;
      default:
        this.radius = 35;
    }
  }

  update(width: number) {
    this.rotationAngle += 0.003; // Slower rotation

    if (this.type === 'MOVING') {
      this.x += this.vx;
      // Bounce off walls
      if (this.x < this.radius) {
        this.x = this.radius;
        this.vx *= -1;
      }
      if (this.x > width - this.radius) {
        this.x = width - this.radius;
        this.vx *= -1;
      }
    } else if (this.type === 'PHANTOM') {
        this.phantomPhase += 0.015; // Slower phasing
        // Opacity follows a sine wave, clamped
        const val = Math.sin(this.phantomPhase);
        // Be solid for 60% of time, fade out quickly
        if (val > -0.2) {
            this.opacity = 1.0;
        } else {
            this.opacity = 0.2; // Ghost mode
        }
    } else if (this.type === 'SHRINKING') {
        this.radius -= this.shrinkRate;
        if (this.radius < 0) this.radius = 0;
    }
  }

  isCollidable(): boolean {
      if (this.broken) return false;
      if (this.type === 'PHANTOM' && this.opacity < 0.5) return false;
      if (this.type === 'SHRINKING' && this.radius < 10) return false;
      return true;
  }

  draw(ctx: CanvasRenderingContext2D, time: number) {
    if (this.broken) return;
    if (this.radius <= 0) return;

    const floatY = this.type === 'START' ? 0 : Math.sin(time * 0.001 + this.visualOffset) * 5;
    
    ctx.save();
    ctx.translate(this.x, this.y + floatY);

    // --- Planet Rendering ---
    ctx.globalAlpha = this.type === 'PHANTOM' ? this.opacity : 1.0;

    if (this.type === 'START') {
        // Draw Launchpad (Flat)
        ctx.fillStyle = '#444';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00f2ff';
        
        // Main platform
        ctx.beginPath();
        ctx.roundRect(-this.radius, -10, this.radius * 2, 20, 5);
        ctx.fill();

        // Glow lines
        ctx.strokeStyle = '#00f2ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-this.radius + 10, -10);
        ctx.lineTo(this.radius - 10, -10);
        ctx.stroke();

        // Launch markers
        ctx.fillStyle = '#00f2ff';
        for(let i=0; i<3; i++) {
            ctx.beginPath();
            ctx.moveTo(-10 + i * 10, -10);
            ctx.lineTo(-5 + i * 10, -20);
            ctx.lineTo(0 + i * 10, -10);
            ctx.fill();
        }
        
    } else {
        // Spherical Planets
        const grad = ctx.createRadialGradient(-this.radius * 0.3, -this.radius * 0.3, this.radius * 0.1, 0, 0, this.radius);
        
        // Set colors based on type
        if (this.type === 'NORMAL') { // Ice Planet
            grad.addColorStop(0, '#aeeeff');
            grad.addColorStop(0.5, '#00c3ff');
            grad.addColorStop(1, '#005577');
        } else if (this.type === 'BOOST') { // Gas Giant (Pink/Magenta)
            grad.addColorStop(0, '#ff88aa');
            grad.addColorStop(0.5, '#ff0055');
            grad.addColorStop(1, '#550022');
        } else if (this.type === 'DOUBLE_JUMP_CHARGER') { // Golden Star
            grad.addColorStop(0, '#ffffcc');
            grad.addColorStop(0.4, '#ffcc00');
            grad.addColorStop(1, '#aa5500');
        } else if (this.type === 'MOVING') { // Tech/Artificial (Green)
            grad.addColorStop(0, '#ccffcc');
            grad.addColorStop(0.5, '#39ff14');
            grad.addColorStop(1, '#004400');
        } else if (this.type === 'BREAKABLE') { // Volcanic/Mars (Red)
            grad.addColorStop(0, '#ff9999');
            grad.addColorStop(0.5, '#ff4d4d');
            grad.addColorStop(1, '#440000');
        } else if (this.type === 'PHANTOM') { // Nebula (Purple)
            grad.addColorStop(0, '#eebaff');
            grad.addColorStop(0.5, '#9d00ff');
            grad.addColorStop(1, '#220044');
        } else if (this.type === 'SHRINKING') { // Dying Star (Orange)
            grad.addColorStop(0, '#ffddaa');
            grad.addColorStop(0.5, '#ff8800');
            grad.addColorStop(1, '#551100');
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // 2. Texture & Details (Clipped to sphere)
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.clip();

        if (this.type === 'NORMAL') {
            // Ice cracks / continents
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            this.craters.forEach(c => {
                ctx.beginPath();
                ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
                ctx.fill();
            });
        } else if (this.type === 'BOOST') {
            // Stripes
            ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
            ctx.save();
            ctx.rotate(Math.PI / 8);
            this.stripes.forEach(s => {
                ctx.fillRect(-this.radius, s.y, this.radius * 2, s.w);
            });
            ctx.restore();
        } else if (this.type === 'BREAKABLE') {
            // Craters
            ctx.fillStyle = 'rgba(50, 0, 0, 0.4)';
            this.craters.forEach(c => {
                ctx.beginPath();
                ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
                ctx.fill();
                // Crater rim highlight
                ctx.strokeStyle = 'rgba(255,100,100,0.3)';
                ctx.stroke();
            });
        } else if (this.type === 'MOVING') {
            // Tech lines
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1.5;
            this.techLines.forEach(l => {
                ctx.beginPath();
                ctx.moveTo(l.x, l.y);
                ctx.lineTo(l.x + Math.cos(l.angle) * l.len, l.y + Math.sin(l.angle) * l.len);
                ctx.stroke();
            });
            // Core
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.beginPath();
            ctx.arc(0, 0, 5, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'PHANTOM') {
            // Swirling smoke
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            for(let i=0; i<3; i++) {
                const angle = time * 0.001 + i * 2;
                const r = this.radius * 0.5;
                ctx.beginPath();
                ctx.arc(Math.cos(angle)*r, Math.sin(angle)*r, 8, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (this.type === 'SHRINKING') {
            // Instability
            ctx.fillStyle = `rgba(255, 255, 0, ${0.2 + Math.sin(time * 0.01) * 0.1})`;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius * 0.7, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Shine / Gloss for all (atmosphere reflection)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.arc(-this.radius * 0.4, -this.radius * 0.4, this.radius * 0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore(); // End clip

        // 3. External effects (Rings, Aura, etc)
        if (this.type === 'BOOST') {
            // Ring
            ctx.save();
            ctx.rotate(Math.PI / 8);
            ctx.beginPath();
            ctx.ellipse(0, 0, this.radius * 1.6, this.radius * 0.4, 0, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 100, 150, 0.6)';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();
        } else if (this.type === 'DOUBLE_JUMP_CHARGER') {
            // Glow pulse
            const pulse = 1 + Math.sin(time * 0.005) * 0.1;
            ctx.shadowColor = '#ffcc00';
            ctx.shadowBlur = 15;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius * pulse, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff';
            ctx.font = '14px Orbitron';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('⚡', 0, 0);
        } else if (this.type === 'MOVING') {
            // Direction arrows
            ctx.strokeStyle = 'rgba(57, 255, 20, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(this.radius + 5, 0);
            ctx.lineTo(this.radius + 10, 0);
            ctx.lineTo(this.radius + 8, -3);
            ctx.moveTo(this.radius + 10, 0);
            ctx.lineTo(this.radius + 8, 3);
            
            ctx.moveTo(-this.radius - 5, 0);
            ctx.lineTo(-this.radius - 10, 0);
            ctx.lineTo(-this.radius - 8, -3);
            ctx.moveTo(-this.radius - 10, 0);
            ctx.lineTo(-this.radius - 8, 3);
            ctx.stroke();
        }
    }

    ctx.restore();
  }
}

class Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number = 20;
  height: number = 30;
  rotation: number = 0;
  hasDoubleJump: boolean = false;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
  }

  update(input: { left: boolean; right: boolean }) {
    // Movement
    if (input.left) this.vx -= ACCEL;
    if (input.right) this.vx += ACCEL;

    // Friction
    this.vx *= FRICTION;

    // Velocity Cap
    if (this.vx > 5) this.vx = 5; // Faster max speed for easier control
    if (this.vx < -5) this.vx = -5;

    // Apply Physics
    this.x += this.vx;
    this.y += this.vy;
    this.vy += GRAVITY;

    // Rotation based on movement
    this.rotation = this.vx * 0.05;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    // Glow
    ctx.shadowBlur = 15;
    ctx.shadowColor = this.hasDoubleJump ? '#ffcc00' : '#00f2ff';

    // Rocket Body
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.moveTo(0, -this.height / 2); // Tip
    ctx.lineTo(this.width / 2, this.height / 2); // Right bottom
    ctx.lineTo(0, this.height / 2 - 5); // Center bottom notch
    ctx.lineTo(-this.width / 2, this.height / 2); // Left bottom
    ctx.closePath();
    ctx.fill();

    // Engine Flame (Procedural)
    ctx.shadowBlur = 10;
    ctx.fillStyle = this.hasDoubleJump ? '#ffcc00' : COLORS.playerEngine;
    const flameHeight = Math.random() * 15 + 10;
    ctx.beginPath();
    ctx.moveTo(-5, this.height / 2 - 2);
    ctx.lineTo(5, this.height / 2 - 2);
    ctx.lineTo(0, this.height / 2 + flameHeight);
    ctx.closePath();
    ctx.fill();

    // Double Jump Indicator
    if (this.hasDoubleJump) {
      ctx.strokeStyle = '#ffcc00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.width, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

// --- React Component ---

const App = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'GAME_OVER'>('START');
  const [score, setScore] = useState(0);

  // Game State Refs (mutable for loop)
  const gameRef = useRef({
    player: new Player(0, 0),
    platforms: [] as Platform[],
    obstacles: [] as Obstacle[],
    particles: [] as Particle[],
    stars: [] as { x: number; y: number; size: number; alpha: number; speed: number; phase: number }[],
    cameraY: 0,
    score: 0,
    input: { left: false, right: false, jump: false },
    lastTime: 0,
    width: 0,
    height: 0,
    difficultyMultiplier: 1,
  });

  // Input Handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') gameRef.current.input.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') gameRef.current.input.right = true;
      if (e.code === 'Space' || e.code === 'ArrowUp') {
          triggerDoubleJump();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') gameRef.current.input.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') gameRef.current.input.right = false;
    };

    const handleTouchStart = (e: TouchEvent) => {
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        if (t.clientY < window.innerHeight * 0.2 && gameState === 'PLAYING') {
            triggerDoubleJump(); // Tap top 20% to double jump
        } else {
            if (t.clientX < window.innerWidth / 2) {
            gameRef.current.input.left = true;
            gameRef.current.input.right = false;
            } else {
            gameRef.current.input.right = true;
            gameRef.current.input.left = false;
            }
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        gameRef.current.input.left = false;
        gameRef.current.input.right = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [gameState]);

  const triggerDoubleJump = () => {
     if (gameState !== 'PLAYING') return;
     const player = gameRef.current.player;
     if (player.hasDoubleJump && player.vy > -3) {
         player.vy = JUMP_FORCE * 1.2;
         player.hasDoubleJump = false;
         createExplosion(player.x, player.y + 15, 10, '#ffcc00');
         sfx.play('DOUBLE_JUMP');
     }
  };

  const initGame = () => {
    sfx.init(); // Init Audio Context
    sfx.play('POWERUP'); // Start sound

    const { width, height } = gameRef.current;
    
    // Reset Player
    gameRef.current.player = new Player(width / 2, height - 150);
    gameRef.current.player.vy = JUMP_FORCE; // Start with a jump
    
    // Reset Platforms & Obstacles
    gameRef.current.platforms = [];
    gameRef.current.obstacles = [];

    // Initial START platform under player
    gameRef.current.platforms.push(new Platform(width / 2, height - 50, 'START'));
    
    // Generate initial platforms
    let y = height - 50;
    while (y > -height) {
      y -= 70 + Math.random() * 40; // Closer together (EASIER)
      generatePlatform(y);
    }

    gameRef.current.score = 0;
    gameRef.current.cameraY = 0;
    gameRef.current.difficultyMultiplier = 1;
    gameRef.current.particles = [];
    setScore(0);
    setGameState('PLAYING');
  };

  const generatePlatform = (y: number) => {
    const { width } = gameRef.current;
    const margin = 40;
    const x = margin + Math.random() * (width - margin * 2);
    
    let type: PlatformType = 'NORMAL';
    
    // Adjust probabilities based on score (difficulty)
    // Slower difficulty curve
    const difficulty = Math.min(gameRef.current.score / 10000, 1); 
    
    // Base probabilities - Easier config
    let pBoost = 0.08; // More boost
    let pDouble = 0.08; // More double jump
    let pMoving = 0.05; // Less moving
    let pBreak = 0.02; // Less breakable
    let pPhantom = 0.0;
    let pShrink = 0.0;

    // Difficulty scaling
    pMoving += difficulty * 0.15;
    pBreak += difficulty * 0.1;
    pPhantom = difficulty > 0.2 ? 0.02 + difficulty * 0.1 : 0; // Starts later
    pShrink = difficulty > 0.3 ? 0.02 + difficulty * 0.1 : 0; // Starts later
    
    const r = Math.random();
    let cumulative = 0;

    cumulative += pDouble;
    if (r < cumulative) { type = 'DOUBLE_JUMP_CHARGER'; } else {
      cumulative += pBoost;
      if (r < cumulative) { type = 'BOOST'; } else {
        cumulative += pPhantom;
        if (r < cumulative) { type = 'PHANTOM'; } else {
            cumulative += pShrink;
            if (r < cumulative) { type = 'SHRINKING'; } else {
                cumulative += pMoving;
                if (r < cumulative) { type = 'MOVING'; } else {
                    cumulative += pBreak;
                    if (r < cumulative) { type = 'BREAKABLE'; } else {
                        type = 'NORMAL';
                    }
                }
            }
        }
      }
    }

    gameRef.current.platforms.push(new Platform(x, y, type));

    // --- Obstacle Generation Logic ---
    // Start appearing after score 1500 (Easier)
    if (gameRef.current.score > 1500) {
        // Chance increases with score, cap at 20% chance per platform gen
        const obstacleChance = Math.min((gameRef.current.score - 1500) / 10000, 0.2);
        
        if (Math.random() < obstacleChance) {
             // Generate Obstacle
             // Black holes only appear after 4000
             const canBlackHole = gameRef.current.score > 4000;
             const type: ObstacleType = (canBlackHole && Math.random() < 0.3) ? 'BLACK_HOLE' : 'UFO';
             
             // Ensure it's not directly on top of the platform we just made
             // Put it somewhere else horizontally or slightly offset vertically
             let ox = Math.random() * (width - 60) + 30;
             // Distance check from platform
             if (Math.abs(ox - x) < 80) { // Safer radius
                 ox = (ox + width / 2) % width; // Move away
             }
             
             // Place it slightly higher than the platform to be annoying
             const oy = y - 70 - Math.random() * 50; 
             
             gameRef.current.obstacles.push(new Obstacle(ox, oy, type));
        }
    }
  };

  const createExplosion = (x: number, y: number, count: number, color: string) => {
    for (let i = 0; i < count; i++) {
      gameRef.current.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5,
        life: 1.0,
        maxLife: 1.0,
        color: color,
        size: Math.random() * 3 + 1
      });
    }
  };

  // Main Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gameRef.current.width = canvas.width;
      gameRef.current.height = canvas.height;
      
      // Init stars if empty
      if (gameRef.current.stars.length === 0) {
        for (let i = 0; i < 150; i++) {
            gameRef.current.stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2 + 0.5,
                alpha: Math.random(),
                speed: Math.random() * 0.1 + 0.02, // Slower stars
                phase: Math.random() * Math.PI * 2
            });
        }
      }
    };
    window.addEventListener('resize', resize);
    resize();

    let animationId: number;

    const loop = (time: number) => {
      if (gameState === 'PLAYING') {
          update(time);
      }
      draw(ctx, time);
      animationId = requestAnimationFrame(loop);
    };

    const update = (time: number) => {
      const { player, platforms, obstacles, width, height, input } = gameRef.current;

      // Player Update
      player.update(input);

      // Platform Update (Moving & Special)
      platforms.forEach(p => p.update(width));
      
      // Obstacle Update & Collision
      obstacles.forEach(o => {
          o.update(width, player);
          
          // Distance for collision/gravity
          const dx = player.x - o.x;
          const dy = player.y - o.y;
          const dist = Math.sqrt(dx*dx + dy*dy);

          if (o.type === 'UFO') {
              // Simple Hitbox
              if (dist < o.radius + player.width) {
                  // Knockback
                  player.vy = 8; // Shoot down slower
                  createExplosion(player.x, player.y, 10, '#00ff00');
                  // Push sideways too
                  player.vx = dx > 0 ? 3 : -3;
                  sfx.play('EXPLOSION');
              }
          } else if (o.type === 'BLACK_HOLE') {
              // Gravity Pull (Inverse Square Law approximation)
              const pullRadius = 250;
              if (dist < pullRadius) {
                  const strength = 800; // weaker pull
                  const force = strength / (dist * dist);
                  // Apply force towards center
                  player.vx -= (dx / dist) * force;
                  player.vy -= (dy / dist) * force;
                  
                  // Add wobble/instability to player
                  player.rotation += 0.1;
              }

              // Event Horizon (Death)
              if (dist < 15) { // Center radius
                  setGameState('GAME_OVER');
                  createExplosion(player.x, player.y, 20, '#8000ff');
                  sfx.play('GAME_OVER');
              }
          }
      });

      // Screen Wrapping
      if (SCREEN_WRAP) {
        if (player.x < -player.width) player.x = width + player.width;
        if (player.x > width + player.width) player.x = -player.width;
      } else {
        if (player.x < 0) { player.x = 0; player.vx *= -0.5; }
        if (player.x > width) { player.x = width; player.vx *= -0.5; }
      }

      // Camera Follow Logic
      if (player.y < height * 0.45) {
        const diff = height * 0.45 - player.y;
        player.y = height * 0.45;
        
        // Move everything down
        platforms.forEach(p => p.y += diff);
        obstacles.forEach(o => o.y += diff);
        
        gameRef.current.stars.forEach(s => {
            s.y += diff * s.speed;
            if (s.y > height) {
                s.y -= height;
                s.x = Math.random() * width; // Respawn randomly x
            }
        });
        gameRef.current.particles.forEach(p => p.y += diff);

        gameRef.current.score += diff;
        setScore(Math.floor(gameRef.current.score));

        // Generate new platforms
        const highestPlatformY = Math.min(...platforms.map(p => p.y));
        if (highestPlatformY > 50) { // Keep some buffer
             generatePlatform(highestPlatformY - (70 + Math.random() * 40)); // ClOSER TOGETHER
        }
      }

      // Cleanup off-screen
      for (let i = platforms.length - 1; i >= 0; i--) {
          if (platforms[i].y > height) {
              platforms.splice(i, 1);
          }
      }
      for (let i = obstacles.length - 1; i >= 0; i--) {
          if (obstacles[i].y > height) {
              obstacles.splice(i, 1);
          }
      }

      // Collision Detection
      if (player.vy > 0) { // Only when falling
          platforms.forEach(p => {
              // Collision Box check
              // For START platform, use a rectangular check more strictly or just wider radius
              let hit = false;
              if (p.isCollidable()) {
                   if (p.type === 'START') {
                       // Box collision
                       if (player.x > p.x - p.radius && player.x < p.x + p.radius &&
                           player.y + player.height/2 >= p.y - 10 &&
                           player.y + player.height/2 <= p.y + 10 &&
                           player.y - player.vy + player.height/2 <= p.y - 10) {
                           hit = true;
                       }
                   } else {
                       // Normal Circle Collision
                       if (player.x > p.x - p.radius - player.width/2 &&
                           player.x < p.x + p.radius + player.width/2 &&
                           player.y + player.height/2 >= p.y - p.radius &&
                           player.y + player.height/2 <= p.y + p.radius &&
                           player.y - player.vy + player.height/2 <= p.y - 10) {
                           hit = true;
                       }
                   }
              }

              if (hit) {
                  // Hit!
                  player.vy = JUMP_FORCE;
                  createExplosion(player.x, player.y + 15, 5, '#00f2ff');
                  sfx.play('JUMP');

                  if (p.type === 'BOOST') {
                      player.vy = SUPER_JUMP_FORCE;
                      createExplosion(player.x, player.y + 15, 15, '#ff0055');
                      sfx.play('BOOST');
                  }
                  if (p.type === 'DOUBLE_JUMP_CHARGER') {
                      player.hasDoubleJump = true;
                      p.type = 'NORMAL'; // Consume the charger
                      sfx.play('POWERUP');
                  }
                  if (p.type === 'BREAKABLE') {
                      p.broken = true;
                      createExplosion(p.x, p.y, 10, '#ff4d4d');
                      sfx.play('BREAK');
                  }
              }
          });
      }

      // Particles
      for (let i = gameRef.current.particles.length - 1; i >= 0; i--) {
          const p = gameRef.current.particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.life -= 0.05;
          if (p.life <= 0) {
              gameRef.current.particles.splice(i, 1);
          }
      }

      // Game Over
      if (player.y > height) {
          if (gameState === 'PLAYING') {
              sfx.play('GAME_OVER');
          }
          setGameState('GAME_OVER');
      }
    };

    const draw = (ctx: CanvasRenderingContext2D, time: number) => {
      const { width, height, player, platforms, obstacles, stars, particles } = gameRef.current;

      // Background Gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, COLORS.backgroundTop);
      gradient.addColorStop(1, COLORS.backgroundBottom);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Stars
      stars.forEach(s => {
          // Twinkle effect
          const alpha = s.alpha * (0.6 + Math.sin(time * 0.002 + s.phase) * 0.4);
          ctx.globalAlpha = alpha;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
          ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // Platforms
      platforms.forEach(p => p.draw(ctx, time));

      // Obstacles
      obstacles.forEach(o => o.draw(ctx, time));

      // Particles
      particles.forEach(p => {
          ctx.globalAlpha = p.life;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // Player
      player.draw(ctx);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [gameState]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      
      {/* HUD */}
      {gameState === 'PLAYING' && (
          <div style={{
              position: 'absolute',
              top: 20,
              left: 20,
              color: COLORS.text,
              fontFamily: 'Orbitron, sans-serif',
              fontSize: '24px',
              textShadow: '0 0 10px #00f2ff'
          }}>
              高度: {Math.floor(score)} M
          </div>
      )}

      {/* Start Screen */}
      {gameState === 'START' && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: COLORS.uiOverlay,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: COLORS.text,
          textAlign: 'center',
          zIndex: 10
        }} onClick={initGame}>
          <h1 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '48px', margin: '0 0 20px 0', textShadow: '0 0 20px #00f2ff' }}>ASTRO LEAP</h1>
          <p style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '24px', letterSpacing: '2px' }}>タップして発進</p>
          <div style={{ marginTop: '40px', fontSize: '16px', opacity: 0.8, fontFamily: 'Rajdhani, sans-serif' }}>
            <p>画面左右タップで移動</p>
            <p>UFOとブラックホールに注意せよ</p>
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState === 'GAME_OVER' && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(20, 0, 0, 0.9)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: COLORS.text,
          textAlign: 'center',
          zIndex: 10
        }} onClick={initGame}>
          <h1 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '48px', color: '#ff4d4d', margin: '0 0 10px 0', textShadow: '0 0 20px #ff0000' }}>通信途絶</h1>
          <h2 style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: '20px', letterSpacing: '5px', marginBottom: '40px' }}>SIGNAL LOST</h2>
          
          <div style={{ marginBottom: '40px' }}>
              <p style={{ fontSize: '16px', color: '#aaa' }}>最終到達高度</p>
              <p style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '42px', margin: '10px 0', color: '#fff' }}>{Math.floor(score)} M</p>
          </div>

          <button style={{
              background: 'transparent',
              border: '2px solid #fff',
              color: '#fff',
              padding: '15px 40px',
              fontFamily: 'Rajdhani, sans-serif',
              fontSize: '20px',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              boxShadow: '0 0 15px rgba(255,255,255,0.3)'
          }}>
              システム再起動 (RETRY)
          </button>
        </div>
      )}
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);