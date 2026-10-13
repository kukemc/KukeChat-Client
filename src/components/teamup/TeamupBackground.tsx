import { useMemo } from 'react';

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
 * 移动端名片详情页的装饰背景（名片主人没有上传背景图时用）：缓慢漂移的光斑和上浮的粒子。
 * 纯装饰；开了「减少动态效果」时由样式表整个关掉。桌面端不用它。
 */
export function TeamupBackground(): JSX.Element {
  const particles = useMemo(() => buildParticles(14, 1337), []);

  return (
    <div className="kc-teamup-bg" aria-hidden="true">
      <div className="kc-teamup-bg-grid" />
      <div className="kc-teamup-aurora kc-teamup-aurora-1" />
      <div className="kc-teamup-aurora kc-teamup-aurora-2" />
      <div className="kc-teamup-aurora kc-teamup-aurora-3" />

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
