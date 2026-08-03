import { useMemo } from 'react';

interface TeamupBackgroundProps {
  variant?: 'full' | 'soft';
}

interface Particle {
  left: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
  opacity: number;
}

function buildParticles(count: number, seed: number): Particle[] {
  const particles: Particle[] = [];
  let state = seed;
  const rand = (): number => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
  for (let index = 0; index < count; index += 1) {
    particles.push({
      left: rand() * 100,
      size: 2 + rand() * 4,
      delay: rand() * 16,
      duration: 14 + rand() * 16,
      drift: (rand() - 0.5) * 80,
      opacity: 0.18 + rand() * 0.4
    });
  }
  return particles;
}

/**
 * Animated ambient background for the teamup center.
 * Drifting aurora blobs + floating particles + slow wireframe shapes.
 * Decorative only; fully disabled under reduced-motion via CSS.
 */
export function TeamupBackground({ variant = 'full' }: TeamupBackgroundProps): JSX.Element {
  const particles = useMemo(() => buildParticles(variant === 'full' ? 26 : 14, 1337), [variant]);

  return (
    <div className="kc-teamup-bg" aria-hidden="true">
      <div className="kc-teamup-bg-grid" />
      <div className="kc-teamup-aurora kc-teamup-aurora-1" />
      <div className="kc-teamup-aurora kc-teamup-aurora-2" />
      <div className="kc-teamup-aurora kc-teamup-aurora-3" />

      {variant === 'full' ? (
        <>
          <div className="kc-teamup-shape kc-teamup-shape-tri" style={{ left: '8%', top: '24%' }} />
          <div className="kc-teamup-shape kc-teamup-shape-ring" style={{ left: '82%', top: '18%' }} />
          <div className="kc-teamup-shape kc-teamup-shape-square" style={{ left: '70%', top: '62%' }} />
          <div className="kc-teamup-shape kc-teamup-shape-plus" style={{ left: '20%', top: '70%' }} />
          <div className="kc-teamup-shape kc-teamup-shape-ring kc-teamup-shape-sm" style={{ left: '46%', top: '14%' }} />
        </>
      ) : null}

      <div className="kc-teamup-particles">
        {particles.map((particle, index) => (
          <span
            key={index}
            className="kc-teamup-particle"
            style={{
              left: `${particle.left}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              opacity: particle.opacity,
              animationDelay: `${particle.delay}s`,
              animationDuration: `${particle.duration}s`,
              ['--kc-drift' as string]: `${particle.drift}px`
            }}
          />
        ))}
      </div>
    </div>
  );
}
