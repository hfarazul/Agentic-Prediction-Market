import OrbAnimation from "./orb-animation"

export default function TruthOrb() {
  return (
    <div className="relative w-32 h-32 mx-auto">
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-600/20"></div>
      <div className="absolute inset-1 rounded-full bg-gradient-to-br from-cyan-400/10 to-blue-500/10 blur-sm"></div>
      <div className="absolute inset-0">
        <OrbAnimation />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(0,0,0,0.7)_70%)]"></div>
    </div>
  )
}

