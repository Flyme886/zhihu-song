export class ParticleWorld {
  constructor(canvas) {
    this.canvas=canvas;this.gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,powerPreference:'high-performance'});
    if(!this.gl)throw Error('WebGL unavailable');
    const gl=this.gl;
    const vertex=`precision highp float;
    attribute vec4 seed;uniform vec2 resolution,center;uniform float radius,time,chaos,dpr,offset;
    uniform mediump float halo;varying mediump float light,depth;
    mat2 rot(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
    void main(){float group=floor(seed.w/0.74*3.0);float t=time;float v=seed.y*2.0-1.0;vec3 p;float bright;
    if(seed.w<0.74){float phase=group*2.0944+offset;float dir=group==1.0?-1.0:1.0;
      float u=seed.x*6.2831853+t*dir*(0.66+group*0.12);u+=0.62*sin(u-phase-t*0.23);
      float bend=0.5*sin(u*2.0+phase-t*0.40)+0.22*sin(u*3.0-phase+t*0.31);
      float lat=v*0.46+bend*(0.65+chaos*0.75);
      float lon=u+0.4*sin(v*3.0+phase-t*0.35)+chaos*0.2*sin(u*3.0+v*4.0+t*0.65);
      float fold=0.5+0.5*sin(v*4.4+u*2.0+phase-t*0.6);
      float r=0.83+0.155*fold+0.008*(seed.z-0.5);
      p=vec3(cos(lat)*cos(lon),sin(lat),cos(lat)*sin(lon));
      p.xz=rot(chaos*0.95*sin(p.y*3.1+t*0.32+phase))*p.xz;
      p.yz=rot(phase*0.70+0.45+0.18*sin(t*0.27+phase))*p.yz;p.xy=rot(phase*0.31)*p.xy;p=normalize(p)*r;
      float front=pow(0.5+0.5*cos(u*2.0-phase-t*1.3),6.0);
      bright=(0.37+0.4*pow(abs(v),4.0)+front*0.68)*(0.84+0.16*sin(v*78.0+u*9.0+t*1.1));
    }else{float u=seed.x*6.2831853+t*0.31;float lat=asin(v);p=vec3(cos(lat)*cos(u),sin(lat),cos(lat)*sin(u));
      p.xz=rot(0.7*sin(p.y*2.8-t*0.28))*p.xz;p.yz=rot(0.45*sin(p.x*3.0+t*0.32))*p.yz;
      float r=0.997-0.007*seed.z;if(seed.w>0.97)r*=pow(seed.z,0.33);p=normalize(p)*r;bright=seed.w>0.97?0.09:0.19;}
    p.xz=rot(-0.25+t*0.035+offset)*p.xz;p.yz=rot(0.18)*p.yz;
    vec2 point=center+vec2(p.x,-p.y)*radius;gl_Position=vec4(point/resolution*2.0-1.0,0.,1.);gl_Position.y=-gl_Position.y;
    float size=max(0.85,(0.63+seed.z*0.37)*dpr);gl_PointSize=size*(halo>0.5?5.5:1.0);
    light=bright*(0.48+0.52*smoothstep(-0.9,0.75,p.z));
    if(seed.w>=0.74&&seed.w<0.97)light*=0.65+2.6*pow(1.0-abs(p.z),5.0);
    depth=p.z*0.5+0.5;}`;
    const fragment=`precision mediump float;uniform mediump float halo;uniform float glow,opacity,gain;uniform vec3 tint;varying mediump float light,depth;
    void main(){vec2 p=gl_PointCoord*2.0-1.0;float r=dot(p,p);if(r>1.0)discard;
      float a=light*exp(-r*(halo>0.5?3.8:2.4))*(halo>0.5?0.021*glow:0.53)*opacity*gain;
      vec3 c=mix(vec3(.57,.68,.84),vec3(.91,.97,1.),depth)*tint;gl_FragColor=vec4(c*a,1.);}`;
    const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;};
    const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
    let rng=982451653;const random=()=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return(rng>>>0)/4294967296;};
    const data=new Float32Array(165000*4);for(let i=0;i<data.length;i++)data[i]=random();
    gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);const attr=gl.getAttribLocation(program,'seed');gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,4,gl.FLOAT,false,0,0);
    this.u={};for(const key of ['resolution','center','radius','time','chaos','dpr','offset','halo','glow','opacity','gain','tint'])this.u[key]=gl.getUniformLocation(program,key);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.disable(gl.DEPTH_TEST);
  }
  resize(width,height){const gl=this.gl;this.dpr=Math.min(devicePixelRatio||1,1.75);this.canvas.width=Math.round(width*this.dpr);this.canvas.height=Math.round(height*this.dpr);gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.uniform2f(this.u.resolution,this.canvas.width,this.canvas.height);gl.uniform1f(this.u.dpr,this.dpr);}
  render(nodes){const gl=this.gl,u=this.u;gl.clearColor(.027,.039,.055,1);gl.clear(gl.COLOR_BUFFER_BIT);
    for(const n of nodes){if(n.opacity<.015||n.r<3)continue;const count=Math.min(165000,Math.max(9000,Math.round(n.r*n.r*5.0)));gl.uniform2f(u.center,n.x*this.dpr,n.y*this.dpr);gl.uniform1f(u.radius,n.r*this.dpr);gl.uniform1f(u.time,n.time);gl.uniform1f(u.chaos,n.chaos);gl.uniform1f(u.offset,n.offset);gl.uniform1f(u.opacity,n.opacity);gl.uniform1f(u.glow,n.glow);gl.uniform1f(u.gain,Math.min(1.9,Math.max(.5,n.r*n.r*4/count)));gl.uniform3fv(u.tint,n.tint);
      gl.uniform1f(u.halo,1);gl.drawArrays(gl.POINTS,0,count);gl.uniform1f(u.halo,0);gl.drawArrays(gl.POINTS,0,count);
    }
  }
}
