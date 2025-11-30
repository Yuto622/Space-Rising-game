import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

// --- Constants & Config ---
const GRAVITY = 0.4;
const JUMP_FORCE = -13;
const SUPER_JUMP_FORCE = -22;
const FRICTION = 0.9;
const SCREEN_WRAP = true;

const COLORS = {
  backgroundTop: '#050510',
  backgroundBottom: '#1a0b2e',
  player: '#ffffff',
  playerEngine: '#00f2ff',
  text: '#ffffff',
  uiOverlay: 'rgba(0, 0, 0, 0.85)',
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
type PlatformType = 'NORMAL' | 'BOOST' | 'DOUBLE_JUMP_CHARGER' | 'MOVING' | 'BREAKABLE' | 'PHANTOM' | 'SHRINKING';

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
        this.radius = 30;
        // Ice patches
        for (let i = 0; i < 3; i++) {
           this.craters.push({
               x: (Math.random() - 0.5) * 20,
               y: (Math.random() - 0.5) * 20,
               r: Math.random() * 8 + 5
           });
        }
        break;
      case 'BOOST':
        this.radius = 25;
        // Gas giant stripes
        for (let i = 0; i < 4; i++) {
            this.stripes.push({
                y: (Math.random() - 0.5) * 40,
                w: Math.random() * 5 + 3
            });
        }
        break;
      case 'DOUBLE_JUMP_CHARGER':
        this.radius = 20;
        break;
      case 'MOVING':
        this.radius = 28;
        this.vx = (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 1.5);
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
        this.radius = 28;
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
        this.radius = 28;
        break;
      case 'SHRINKING':
        this.radius = 35; // Start slightly larger
        this.shrinkRate = 0.03 + Math.random() * 0.03;
        break;
      default:
        this.radius = 30;
    }
  }

  update(width: number) {
    this.rotationAngle += 0.01; // Slowly rotate visuals

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
        this.phantomPhase += 0.05;
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

    const floatY = Math.sin(time * 0.002 + this.visualOffset) * 5;
    
    ctx.save();
    ctx.translate(this.x, this.y + floatY);

    // --- Planet Rendering ---
    ctx.globalAlpha = this.type === 'PHANTOM' ? this.opacity : 1.0;

    // 1. Base Gradient (Spherical look)
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
             const angle = time * 0.002 + i * 2;
             const r = this.radius * 0.5;
             ctx.beginPath();
             ctx.arc(Math.cos(angle)*r, Math.sin(angle)*r, 8, 0, Math.PI * 2);
             ctx.fill();
        }
    } else if (this.type === 'SHRINKING') {
        // Instability
        ctx.fillStyle = `rgba(255, 255, 0, ${0.2 + Math.sin(time * 0.02) * 0.1})`;
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
        // Back part slightly hidden (simulated by drawing again with composition? Simple is fine for now)
        ctx.restore();
    } else if (this.type === 'DOUBLE_JUMP_CHARGER') {
        // Glow pulse
        const pulse = 1 + Math.sin(time * 0.01) * 0.1;
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
    if (input.left) this.vx -= 0.8;
    if (input.right) this.vx += 0.8;

    // Friction
    this.vx *= FRICTION;

    // Velocity Cap
    if (this.vx > 10) this.vx = 10;
    if (this.vx < -10) this.vx = -10;

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
     if (player.hasDoubleJump && player.vy > -5) {
         player.vy = JUMP_FORCE * 1.2;
         player.hasDoubleJump = false;
         createExplosion(player.x, player.y + 15, 10, '#ffcc00');
     }
  };

  const initGame = () => {
    const { width, height } = gameRef.current;
    
    // Reset Player
    gameRef.current.player = new Player(width / 2, height - 150);
    gameRef.current.player.vy = JUMP_FORCE; // Start with a jump
    
    // Reset Platforms
    gameRef.current.platforms = [];
    // Initial platform under player
    gameRef.current.platforms.push(new Platform(width / 2, height - 50, 'NORMAL'));
    
    // Generate initial platforms
    let y = height - 50;
    while (y > -height) {
      y -= 100 + Math.random() * 50;
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
    const difficulty = Math.min(gameRef.current.score / 5000, 1); // 0 to 1
    
    // Base probabilities
    let pBoost = 0.05;
    let pDouble = 0.05;
    let pMoving = 0.1;
    let pBreak = 0.05;
    let pPhantom = 0.0;
    let pShrink = 0.0;

    // Difficulty scaling
    pMoving += difficulty * 0.15;
    pBreak += difficulty * 0.1;
    pPhantom = difficulty > 0.1 ? 0.05 + difficulty * 0.1 : 0;
    pShrink = difficulty > 0.2 ? 0.05 + difficulty * 0.1 : 0;
    
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
                speed: Math.random() * 0.2 + 0.05,
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
      const { player, platforms, width, height, input } = gameRef.current;

      // Player Update
      player.update(input);

      // Platform Update (Moving & Special)
      platforms.forEach(p => p.update(width));

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
             generatePlatform(highestPlatformY - (100 + Math.random() * 50));
        }
      }

      // Cleanup off-screen
      for (let i = platforms.length - 1; i >= 0; i--) {
          if (platforms[i].y > height) {
              platforms.splice(i, 1);
          }
      }

      // Collision Detection
      if (player.vy > 0) { // Only when falling
          platforms.forEach(p => {
              if (p.isCollidable() && 
                  player.x > p.x - p.radius - player.width/2 &&
                  player.x < p.x + p.radius + player.width/2 &&
                  player.y + player.height/2 >= p.y - p.radius && // Top of platform approx
                  player.y + player.height/2 <= p.y + p.radius && // Inside platform
                  player.y - player.vy + player.height/2 <= p.y - 10 // Was above previously (rough check)
                 ) {
                  
                  // Hit!
                  player.vy = JUMP_FORCE;
                  createExplosion(player.x, player.y + 15, 5, '#00f2ff');

                  if (p.type === 'BOOST') {
                      player.vy = SUPER_JUMP_FORCE;
                      createExplosion(player.x, player.y + 15, 15, '#ff0055');
                  }
                  if (p.type === 'DOUBLE_JUMP_CHARGER') {
                      player.hasDoubleJump = true;
                      p.type = 'NORMAL'; // Consume the charger
                  }
                  if (p.type === 'BREAKABLE') {
                      p.broken = true;
                      createExplosion(p.x, p.y, 10, '#ff4d4d');
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
          setGameState('GAME_OVER');
      }
    };

    const draw = (ctx: CanvasRenderingContext2D, time: number) => {
      const { width, height, player, platforms, stars, particles } = gameRef.current;

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
            <p>特殊な惑星を見極めろ</p>
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