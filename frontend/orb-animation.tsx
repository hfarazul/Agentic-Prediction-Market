"use client"

import { useEffect, useRef } from "react"

export default function OrbAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas dimensions
    const setCanvasDimensions = () => {
      const size = Math.min(200, window.innerWidth * 0.3)
      canvas.width = size
      canvas.height = size
    }

    setCanvasDimensions()
    window.addEventListener("resize", setCanvasDimensions)

    // Particles
    const particles: Particle[] = []
    const particleCount = 50

    class Particle {
      x: number
      y: number
      radius: number
      color: string
      speedX: number
      speedY: number

      constructor() {
        this.x = canvas.width / 2
        this.y = canvas.height / 2
        this.radius = Math.random() * 2 + 1
        this.color = `rgba(${Math.floor(Math.random() * 100 + 155)}, ${Math.floor(Math.random() * 100 + 155)}, 255, ${Math.random() * 0.5 + 0.3})`
        const angle = Math.random() * Math.PI * 2
        const speed = Math.random() * 1 + 0.5
        this.speedX = Math.cos(angle) * speed
        this.speedY = Math.sin(angle) * speed
      }

      update() {
        // Calculate distance from center
        const dx = this.x - canvas.width / 2
        const dy = this.y - canvas.height / 2
        const distance = Math.sqrt(dx * dx + dy * dy)
        const maxDistance = canvas.width / 2 - this.radius

        // If particle is outside the orb, redirect it toward center
        if (distance > maxDistance) {
          const angle = Math.atan2(dy, dx)
          this.speedX = -Math.cos(angle) * 1
          this.speedY = -Math.sin(angle) * 1
        }

        this.x += this.speedX
        this.y += this.speedY
      }

      draw() {
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2)
        ctx.fillStyle = this.color
        ctx.fill()
      }
    }

    // Initialize particles
    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle())
    }

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw orb background
      const gradient = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        0,
        canvas.width / 2,
        canvas.height / 2,
        canvas.width / 2,
      )
      gradient.addColorStop(0, "rgba(0, 150, 255, 0.1)")
      gradient.addColorStop(0.5, "rgba(0, 100, 200, 0.05)")
      gradient.addColorStop(1, "rgba(0, 50, 150, 0)")

      ctx.beginPath()
      ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2, 0, Math.PI * 2)
      ctx.fillStyle = gradient
      ctx.fill()

      // Draw particles
      particles.forEach((particle) => {
        particle.update()
        particle.draw()
      })

      // Draw orb outline
      ctx.beginPath()
      ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2 - 1, 0, Math.PI * 2)
      ctx.strokeStyle = "rgba(100, 200, 255, 0.2)"
      ctx.stroke()

      requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener("resize", setCanvasDimensions)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
}

