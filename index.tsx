import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

// --- Constants & Config ---
const GRAVITY = 0.4;
const JUMP_FORCE = -13;
const SUPER_JUMP_FORCE = -22;
const FRICTION = 0.9;
const SCREEN_WRAP = true;

const COLORS = {
  backgroundTop: '#0f0c29',
  backgroundBottom: '#302b63',
  player: '#ffffff',
  playerEngine: '#00f2ff',
  platformNormal: '#00f2ff', // Cyan
  platformBoost: '#ff0055', // Magenta
  platformSpecial: '#ffcc00', // Yellow/Gold
  platformMoving: '#39ff14', // Neon Green
  platformBreakable: '#ff4d4d', // Red/Orange
  text: '#ffffff',
  uiOverlay: 'rgba(0, 0, 0, 0.7)',
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
type PlatformType = 'NORMAL' | 'BOOST' | 'DOUBLE_JUMP_CHARGER' | 'MOVING' | 'BREAKABLE';

class Platform {
  x: number;
  y: number;
  radius: number;
  type: PlatformType;
  id: number;
  visualOffset: number; // For floating animation
  vx: number = 0;
  broken: boolean = false;

  constructor(x: number, y: number, type: PlatformType) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.id = Math.random();
    this.visualOffset = Math.random() * Math.PI * 2;

    // Type specific config
    switch (type) {
      case 'NORMAL':
        this.radius = 30;
        break;
      case 'BOOST':
        this.radius = 25;
        break;
      case 'DOUBLE_JUMP_CHARGER':
        this.radius = 20;
        break;
      case 'MOVING':
        this.radius = 28;
        this.vx = (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 1.5);
        break;
      case 'BREAKABLE':
        this.radius = 28;
        break;
      default:
        this.radius = 30;
    }
  }

  update(width: number) {
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
    }
  }

  draw(ctx: CanvasRenderingContext2D, time: number) {
    if (this.broken) return;

    const floatY = Math.sin(time * 0.002 + this.visualOffset) * 5;
    
    ctx.save();
    ctx.translate(this.x, this.y + floatY);

    // Color selection
    let color = COLORS.platformNormal;
    if (this.type === 'BOOST') color = COLORS.platformBoost;
    if (this.type === 'DOUBLE_JUMP_CHARGER') color = COLORS.platformSpecial;
    if (this.type === 'MOVING') color = COLORS.platformMoving;
    if (this.type === 'BREAKABLE') color = COLORS.platformBreakable;

    ctx.shadowBlur = 20;
    ctx.shadowColor = color;
    ctx.fillStyle = color;

    // Planet body
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // Detail (Rings or surface)
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.arc(-this.radius * 0.3, -this.radius * 0.3, this.radius * 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Special visuals per type
    if (this.type === 'BOOST') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, this.radius + 8, this.radius * 0.3, Math.PI / 4, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.type === 'DOUBLE_JUMP_CHARGER') {
      ctx.fillStyle = '#fff';
      ctx.font = '12px Orbitron';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡', 0, 0);
    } else if (this.type === 'MOVING') {
      // Draw arrows or orbital lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-this.radius + 5, 0);
      ctx.lineTo(this.radius - 5, 0);
      ctx.stroke();
      // Arrow heads
      ctx.beginPath();
      ctx.moveTo(-this.radius + 10, -5);
      ctx.lineTo(-this.radius + 5, 0);
      ctx.lineTo(-this.radius + 10, 5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(this.radius - 10, -5);
      ctx.lineTo(this.radius - 5, 0);
      ctx.lineTo(this.radius - 10, 5);
      ctx.stroke();
    } else if (this.type === 'BREAKABLE') {
        // Cracks
        ctx.strokeStyle = 'rgba(50, 0, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-10, -10);
        ctx.lineTo(5, 5);
        ctx.lineTo(15, -5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 10);
        ctx.lineTo(-5, 0);
        ctx.lineTo(-15, 5);
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
    ctx.shadowColor = this.hasDoubleJump ? COLORS.platformSpecial : COLORS.playerEngine;

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
    ctx.fillStyle = this.hasDoubleJump ? COLORS.platformSpecial : COLORS.playerEngine;
    const flameHeight = Math.random() * 15 + 10;
    ctx.beginPath();
    ctx.moveTo(-5, this.height / 2 - 2);
    ctx.lineTo(5, this.height / 2 - 2);
    ctx.lineTo(0, this.height / 2 + flameHeight);
    ctx.closePath();
    ctx.fill();

    // Double Jump Indicator
    if (this.hasDoubleJump) {
      ctx.strokeStyle = COLORS.platformSpecial;
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
  const [highScore, setHighScore] = useState(0);

  // Game State Refs (mutable for loop)
  const gameRef = useRef({
    player: new Player(0, 0),
    platforms: [] as Platform[],
    particles: [] as Particle[],
    stars: [] as { x: number; y: number; size: number; alpha: number; speed: number }[],
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
          // Double jump trigger
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
     if (player.hasDoubleJump && player.vy > -5) { // Can only double jump if not already shooting up super fast
         player.vy = JUMP_FORCE * 1.2;
         player.hasDoubleJump = false;
         createExplosion(player.x, player.y + 15, 10, COLORS.platformSpecial);
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
    
    const rand = Math.random();
    let type: PlatformType = 'NORMAL';
    
    // Probability distribution
    if (rand > 0.95) type = 'DOUBLE_JUMP_CHARGER'; // 5%
    else if (rand > 0.90) type = 'BOOST';          // 5%
    else if (rand > 0.75) type = 'MOVING';         // 15%
    else if (rand > 0.65) type = 'BREAKABLE';      // 10%
    else type = 'NORMAL';                          // 65%

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
        for (let i = 0; i < 100; i++) {
            gameRef.current.stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2,
                alpha: Math.random(),
                speed: Math.random() * 0.5 + 0.1
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

      // Platform Update (Moving)
      platforms.forEach(p => p.update(width));

      // Screen Wrapping
      if (SCREEN_WRAP) {
        if (player.x < -player.width) player.x = width + player.width;
        if (player.x > width + player.width) player.x = -player.width;
      } else {
        if (player.x < 0) { player.x = 0; player.vx *= -0.5; }
        if (player.x > width) { player.x = width; player.vx *= -0.5; }
      }

      // Camera Follow logic (Entities move down, player looks like they go up)
      if (player.y < height * 0.45) {
        const diff = height * 0.45 - player.y;
        player.y = height * 0.45;
        
        // Move platforms down
        platforms.forEach(p => p.y += diff);
        
        // Move particles down
        gameRef.current.particles.forEach(p => p.y += diff);
        
        // Move Stars (Parallax)
        gameRef.current.stars.forEach(s => {
            s.y += diff * s.speed;
            if (s.y > height) {
                s.y = 0;
                s.x = Math.random() * width;
            }
        });

        // Score Calculation (based on distance travelled)
        gameRef.current.score += Math.floor(diff * 0.1);
        setScore(Math.floor(gameRef.current.score));

        // Generate new platforms
        const highestPlatformY = Math.min(...platforms.map(p => p.y));
        if (highestPlatformY > 100) {
            generatePlatform(highestPlatformY - (100 + Math.random() * 60));
        }
      }

      // Remove old or broken platforms
      for (let i = platforms.length - 1; i >= 0; i--) {
        if (platforms[i].y > height || platforms[i].broken) {
            platforms.splice(i, 1);
        }
      }

      // Gravity / Falling Death
      if (player.y > height) {
        setHighScore(prev => Math.max(prev, gameRef.current.score));
        setGameState('GAME_OVER');
      }

      // Collision Detection
      // Only check collision if falling
      if (player.vy > 0) {
        platforms.forEach(p => {
            if (p.broken) return;

            // Simple proximity check for circle platform vs point player (bottom of player)
            // Ideally AABB or Circle-Rect, but since player lands on feet:
            const distX = player.x - p.x;
            const distY = (player.y + player.height/2) - (p.y - p.radius * 0.5); // Tune landing spot
            
            // Check if within horizontal bounds and vertical bounds
            if (distX > -(p.radius + 10) && distX < (p.radius + 10) &&
                distY > -15 && distY < 15) {
                
                // Landed!
                createExplosion(player.x, player.y + player.height/2, 5, COLORS.text);
                
                if (p.type === 'BOOST') {
                    player.vy = SUPER_JUMP_FORCE;
                    createExplosion(p.x, p.y, 10, COLORS.platformBoost);
                } else if (p.type === 'DOUBLE_JUMP_CHARGER') {
                    player.vy = JUMP_FORCE;
                    player.hasDoubleJump = true;
                    p.type = 'NORMAL'; 
                } else if (p.type === 'BREAKABLE') {
                    player.vy = JUMP_FORCE;
                    p.broken = true;
                    createExplosion(p.x, p.y, 8, COLORS.platformBreakable);
                } else {
                    player.vy = JUMP_FORCE;
                }
            }
        });
      }

      // Particles Update
      for (let i = gameRef.current.particles.length - 1; i >= 0; i--) {
          const p = gameRef.current.particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.life -= 0.02;
          if (p.life <= 0) gameRef.current.particles.splice(i, 1);
      }
    };

    const draw = (ctx: CanvasRenderingContext2D, time: number) => {
      const { width, height, player, platforms, stars, particles } = gameRef.current;

      // Clear & Background
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, COLORS.backgroundTop);
      gradient.addColorStop(1, COLORS.backgroundBottom);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Draw Stars
      ctx.fillStyle = '#ffffff';
      stars.forEach(s => {
          ctx.globalAlpha = Math.abs(Math.sin(time * 0.001 * s.speed + s.x)) * s.alpha;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
          ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // Draw Platforms
      platforms.forEach(p => p.draw(ctx, time));

      // Draw Particles
      particles.forEach(p => {
          ctx.globalAlpha = p.life;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // Draw Player (Only if playing or game over but still visible)
      if (gameState !== 'START') {
        player.draw(ctx);
      }
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [gameState]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', touchAction: 'none' }}
      />
      
      {/* HUD */}
      {gameState === 'PLAYING' && (
        <div style={{
          position: 'absolute',
          top: 20,
          left: 20,
          fontFamily: 'Orbitron',
          fontSize: '24px',
          color: COLORS.text,
          textShadow: '0 0 10px cyan',
          pointerEvents: 'none',
        }}>
          ALTITUDE: {score}
          {gameRef.current.player.hasDoubleJump && (
            <div style={{ fontSize: '14px', color: COLORS.platformSpecial, marginTop: '4px' }}>
              DOUBLE JUMP READY (TAP/SPACE)
            </div>
          )}
        </div>
      )}

      {/* Start Screen */}
      {gameState === 'START' && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          backgroundColor: COLORS.uiOverlay,
          backdropFilter: 'blur(5px)'
        }}>
          <h1 style={{ fontFamily: 'Orbitron', fontSize: '48px', margin: '0 0 20px 0', textShadow: '0 0 20px #00f2ff' }}>
            ASTRO LEAP
          </h1>
          <p style={{ fontFamily: 'Rajdhani', fontSize: '18px', maxWidth: '300px', textAlign: 'center', lineHeight: '1.5' }}>
            Tap Left/Right to Move.<br/>
            Land on glowing planets.<br/>
            <span style={{color: COLORS.platformBoost}}>Magenta</span> = Super Jump<br/>
            <span style={{color: COLORS.platformSpecial}}>Yellow</span> = Charge Double Jump<br/>
            <span style={{color: COLORS.platformMoving}}>Green</span> = Moving<br/>
            <span style={{color: COLORS.platformBreakable}}>Red</span> = Breakable
          </p>
          <button 
            onClick={initGame}
            style={{
              marginTop: '30px',
              padding: '15px 40px',
              fontSize: '24px',
              fontFamily: 'Orbitron',
              background: 'linear-gradient(45deg, #00f2ff, #0099ff)',
              border: 'none',
              borderRadius: '30px',
              color: 'white',
              cursor: 'pointer',
              boxShadow: '0 0 20px rgba(0, 242, 255, 0.5)'
            }}
          >
            LAUNCH
          </button>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState === 'GAME_OVER' && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          backgroundColor: COLORS.uiOverlay,
          backdropFilter: 'blur(5px)'
        }}>
          <h2 style={{ fontFamily: 'Orbitron', fontSize: '42px', color: '#ff0055', textShadow: '0 0 20px red' }}>
            SIGNAL LOST
          </h2>
          <div style={{ fontSize: '24px', marginBottom: '10px' }}>SCORE: {score}</div>
          <div style={{ fontSize: '18px', color: '#aaa', marginBottom: '30px' }}>BEST: {highScore}</div>
          
          <button 
            onClick={initGame}
            style={{
              padding: '15px 40px',
              fontSize: '24px',
              fontFamily: 'Orbitron',
              background: 'transparent',
              border: '2px solid white',
              borderRadius: '30px',
              color: 'white',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            RETRY
          </button>
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);