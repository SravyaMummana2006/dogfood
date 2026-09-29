export default function Cube3D() {
  return (
    <div className="cube-container mx-auto mt-12 mb-16 lg:my-0 lg:ml-auto">
      {/* Outer Wireframe */}
      <div className="wireframe-cube outer">
        <div className="wireframe-face cube-front" />
        <div className="wireframe-face cube-back" />
        <div className="wireframe-face cube-right" />
        <div className="wireframe-face cube-left" />
        <div className="wireframe-face cube-top" />
        <div className="wireframe-face cube-bottom" />
      </div>
      {/* Inner Wireframe */}
      <div className="wireframe-cube inner">
        <div className="wireframe-face cube-front" />
        <div className="wireframe-face cube-back" />
        <div className="wireframe-face cube-right" />
        <div className="wireframe-face cube-left" />
        <div className="wireframe-face cube-top" />
        <div className="wireframe-face cube-bottom" />
      </div>
    </div>
  );
}
