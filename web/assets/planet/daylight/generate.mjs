/** Original daylight miniature assets. Run: node web/assets/planet/daylight/generate.mjs */
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from '../../../vendor/three/addons/loaders/GLTFLoader.js';
import { writeFile, readFile } from 'node:fs/promises';

// GLTFExporter uses the browser FileReader interface for its final binary buffer.
globalThis.FileReader ??= class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onload?.({ target: this });
    this.onloadend?.({ target: this });
  }
  async readAsDataURL(blob) {
    this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
    this.onload?.({ target: this });
    this.onloadend?.({ target: this });
  }
};

const out = new URL('./', import.meta.url);
const P = Math.PI;
const material = (name, color, roughness = .76, extra = {}) => new THREE.MeshStandardMaterial({ name, color, roughness, metalness: 0, ...extra });
const M = {
  cream: material('Coat · warm ivory', '#eee1c6'),
  creamShade: material('Coat · shaded stitching', '#d2c3a4'),
  creamLight: material('Coat · collar highlight', '#fff0d5'),
  knit: material('Knit · oat', '#c6aa81'),
  navy: material('Trousers · ink indigo', '#273c54'),
  navyShade: material('Trousers · seams', '#1d3045'),
  skin: material('Skin · warm terracotta', '#cf9874'),
  skinLight: material('Skin · cheek', '#dba582'),
  skinShade: material('Skin · lip and ear', '#ad715b'),
  hair: material('Hair · dark chestnut', '#45302a'),
  hairLight: material('Hair · sculpted locks', '#5a3e31'),
  eyes: material('Eyes · umber', '#292c2c'),
  eyeWhite: material('Eyes · warm ivory', '#eadbc0'),
  boot: material('Shoes · brown leather', '#644b3b', .7),
  sole: material('Shoes · dark soles', '#342e2b'),
  laces: material('Shoes · ecru laces', '#c6b395'),
  ochre: material('Pack · ochre canvas', '#b77c3e'),
  ochreLight: material('Pack · golden piping', '#c9904d'),
  leather: material('Pack · leather straps', '#765338'),
  brass: material('Hardware · aged brass', '#bda16b', .4, { metalness: .48 }),
  bookCover: material('Book · sage cloth', '#6f998c'),
  paper: material('Paper · warm', '#eee5ce'),
  wood: material('Bench · honey heartwood', '#ac7450'),
  woodLight: material('Bench · sunlit grain', '#cf9667'),
  woodDark: material('Bench · darker grain', '#986242'),
  iron: material('Bench · forest enamel', '#365149', .54, { metalness: .28 }),
  mint: material('Sign · sage enamel', '#8cafa0'),
  coral: material('Sign · clay pink enamel', '#ce967c'),
  blue: material('Postcard · blue distance', '#79a6aa'),
  sky: material('Postcard · sky', '#c2d8ce'),
  stone: material('Plinth · limestone', '#c9c6b4'),
  stoneLight: material('Plinth · upper edges', '#e5dfc9'),
  stoneShade: material('Plinth · carved grooves', '#adac9e'),
  marble: material('Bust · porcelain limestone', '#eeeadd', .6),
  marbleShade: material('Bust · recessed carving', '#c3c1b6', .82),
  marbleLight: material('Bust · carving ridges', '#f4efe1', .68),
};

function group(name, parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent?.add(g); return g;
}
function mesh(name, geometry, mat, parent, pos = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const o = new THREE.Mesh(geometry, mat); o.name = name; o.position.fromArray(pos); o.scale.fromArray(scale); o.rotation.set(rotation[0]??0,rotation[1]??0,rotation[2]??0);
  o.castShadow = true; o.receiveShadow = true; parent.add(o); return o;
}
function ellipsoid(name, parent, mat, pos, scale, rotation = [0, 0, 0], segments = 18) {
  return mesh(name, new THREE.SphereGeometry(1, segments, Math.max(10, Math.round(segments * .68))), mat, parent, pos, scale, rotation);
}
function cylinder(name, parent, mat, top, bottom, height, pos, rotation = [0, 0, 0], segments = 16) {
  return mesh(name, new THREE.CylinderGeometry(top, bottom, height, segments), mat, parent, pos, [1, 1, 1], rotation);
}
function roundedShape(w, h, radius) {
  const s = new THREE.Shape(), r = Math.min(radius, w / 2, h / 2), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
function roundedBox(name, parent, mat, size, pos, radius = .015, rotation = [0, 0, 0]) {
  const [w, h, d] = size, b = Math.min(radius * .32, d * .35);
  const geo = new THREE.ExtrudeGeometry(roundedShape(w - 2 * b, h - 2 * b, Math.max(.0001, radius - b)), {
    depth: d - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 5, steps: 1,
  });
  geo.translate(0, 0, -d / 2 + b);
  return mesh(name, geo, mat, parent, pos, [1, 1, 1], rotation);
}
function tube(name, parent, mat, points, radius, tubularSegments = 12) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return mesh(name, new THREE.TubeGeometry(curve, tubularSegments, radius, 6, false), mat, parent);
}
function loft(name, parent, mat, rings, segments = 24) {
  const positions = [], uv = [], indices = [];
  rings.forEach(([y, rx, rz, dz = 0], k) => {
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * P * 2;
      positions.push(Math.sin(a) * rx, y, Math.cos(a) * rz + dz); uv.push(i / segments, k / (rings.length - 1));
      if (k < rings.length - 1 && i < segments) {
        const p = k * (segments + 1) + i, q = p + segments + 1;
        if(rings.at(-1)[0] >= rings[0][0]) indices.push(p, p + 1, q, q, p + 1, q + 1);
        else indices.push(p, q, p + 1, q, q + 1, p + 1);
      }
    }
  });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(indices); geo.computeVertexNormals();
  return mesh(name, geo, mat, parent);
}
function seam(name, parent, mat, points, r = .0025) { return tube(name, parent, mat, points, r); }

function makeTraveler() {
  const scene = new THREE.Scene(); scene.name = 'Daylight · the quiet traveler';
  const avatar = group('avatar', scene);
  avatar.userData = { forward: '+Z', up: '+Y', units: 'meters', originalProceduralAsset: true, author: 'Codex for this project', height: 1.76 };
  const torso = group('torso', avatar, 0, .92, 0);
  roundedBox('Trouser waistband', torso, M.navyShade, [.29, .105, .202], [0, .004, -.005], .033);
  loft('Tailored ivory coat', torso, M.cream, [[.00,.171,.105],[.014,.183,.116],[.055,.187,.119],[.19,.173,.111],[.34,.188,.122],[.435,.2,.112],[.482,.151,.085],[.492,.073,.066]]);
  roundedBox('Knitted shirt', torso, M.knit, [.096, .152, .065], [0, .412, .091], .014);
  // Two slightly angled lapels catch the soft light and make the outerwear legible.
  roundedBox('Left lapel', torso, M.creamLight, [.065, .188, .026], [-.056, .399, .122], .012, [.04, -.14, -.20]);
  roundedBox('Right lapel', torso, M.creamLight, [.065, .188, .026], [.056, .399, .122], .012, [.04, .14, .20]);
  seam('Coat center placket', torso, M.creamShade, [[.012,.02,.119],[.012,.15,.113],[.012,.28,.12],[.012,.33,.119]], .0032);
  seam('Coat lower hem', torso, M.creamShade, [[-.17,.025,.06],[-.12,.021,.106],[0,.019,.121],[.12,.021,.106],[.17,.025,.06]], .002);
  for (const y of [.085, .175, .265]) cylinder(`Horn button ${y}`, torso, M.leather, .006, .006, .006, [.027, y, .122], [P / 2, 0, 0], 10);
  for (const side of [-1, 1]) {
    roundedBox(`Welt pocket ${side}`, torso, M.creamShade, [.07,.009,.005], [side*.118,.153,.097], .003, [0,side*.31,side*.12]);
    seam(`Pocket topstitch ${side}`, torso, M.creamLight, [[side*.077,.15,.113],[side*.108,.146,.109],[side*.15,.14,.094]], .0017);
  }
  cylinder('Neck', torso, M.skin, .049, .057, .09, [0,.535,.003]);
  cylinder('Ribbed collar', torso, M.knit, .059, .064, .028, [0,.505,.003]);
  const head = group('head', torso, 0, .573, .006);
  loft('Sculpted human face', head, M.skin, [[-.006,.035,.04,.008],[.009,.071,.075,.007],[.035,.094,.087,.01],[.076,.107,.09,.01],[.13,.106,.089,.008],[.173,.101,.086,0],[.206,.083,.071,-.007],[.226,.033,.038,-.008],[.23,.001,.001,-.008]], 28);
  // Slight cheek planes, ears and restrained facial features preserve a human reading at small scale.
  for (const side of [-1, 1]) {
    ellipsoid(`Cheek ${side}`, head, M.skinLight, [side*.064,.071,.068], [.037,.031,.019], [0,0,side*.18]);
    ellipsoid(`Ear ${side}`, head, M.skin, [side*.106,.107,-.001], [.022,.038,.021]);
    ellipsoid(`Ear carving ${side}`, head, M.skinShade, [side*.118,.108,.012], [.007,.019,.009]);
    ellipsoid(`Eye socket ${side}`, head, M.skinShade, [side*.039,.13,.088], [.025,.012,.007], [0,side*.15,0]);
    ellipsoid(`Eye ivory ${side}`, head, M.eyeWhite, [side*.039,.13,.094], [.019,.008,.004]);
    ellipsoid(`Eye pupil ${side}`, head, M.eyes, [side*.038,.13,.098], [.007,.007,.003]);
    seam(`Eyebrow ${side}`, head, M.hair, [[side*.019,.151,.092],[side*.037,.155,.096],[side*.059,.149,.088]], .004);
  }
  ellipsoid('Nose bridge', head, M.skinLight, [0,.114,.099], [.016,.032,.017], [-.2,0,0]);
  ellipsoid('Nose tip', head, M.skinLight, [0,.09,.116], [.019,.014,.017]);
  ellipsoid('Nostril left', head, M.skinShade, [-.012,.084,.116], [.006,.004,.005]);
  ellipsoid('Nostril right', head, M.skinShade, [.012,.084,.116], [.006,.004,.005]);
  seam('Mouth gentle curve', head, M.skinShade, [[-.023,.052,.095],[0,.049,.102],[.023,.054,.095]], .003);
  ellipsoid('Lower lip', head, M.skinLight, [0,.044,.096], [.02,.006,.006]);
  // Sculpted chestnut cap and directional individual locks; the forehead remains visible.
  const cap = new THREE.SphereGeometry(1, 28, 14, 0, P*2, 0, P*.56);
  mesh('Short chestnut crown', cap, M.hair, head, [0,.145,-.011], [.111,.099,.096]);
  ellipsoid('Hair back', head, M.hair, [0,.126,-.073], [.09,.071,.035]);
  for (const side of [-1,1]) roundedBox(`Sideburn ${side}`,head,M.hair,[.022,.059,.032],[side*.094,.137,.013],.009,[0,0,side*.06]);
  for (let i = 0; i < 7; i++) {
    const x = -.079 + i*.024;
    ellipsoid(`Swept fringe ${i}`,head,i%3===0?M.hairLight:M.hair,[x,.194 + .017*Math.cos(i*.55),.06],[.031,.034,.043],[.14,-.25,-.48],14);
  }
  seam('Hair part',head,M.hairLight,[[.036,.195,.074],[.045,.223,.017],[.036,.23,-.029]],.0035);

  for (const [suffix, side] of [['L',1], ['R',-1]]) {
    const arm = group(`arm${suffix}`,torso,side*.185,.434,0); arm.rotation.z = side*.055;
    ellipsoid(`Shoulder tailoring ${suffix}`,arm,M.cream,[side*.006,-.035,0],[.075,.082,.087]);
    loft(`Upper sleeve ${suffix}`,arm,M.cream,[[-.015,.077,.082],[-.045,.08,.083],[-.22,.061,.065],[-.275,.06,.061]],18);
    const forearm = group(`forearm${suffix}`,arm,0,-.279,0);
    ellipsoid(`Elbow tailoring ${suffix}`,arm,M.cream,[0,-.276,0],[.059,.052,.06]);
    loft(`Lower sleeve ${suffix}`,forearm,M.cream,[[-.004,.062,.061],[-.035,.061,.061],[-.201,.045,.05],[-.225,.046,.048]],18);
    cylinder(`Folded cuff ${suffix}`,forearm,M.creamShade,.048,.048,.027,[0,-.214,0]);
    cylinder(`Cuff edge ${suffix}`,forearm,M.creamLight,.049,.049,.01,[0,-.225,0]);
    ellipsoid(`Hand ${suffix}`,forearm,M.skin,[0,-.281,.006],[.038,.063,.024],[0,0,side*-.08]);
    ellipsoid(`Thumb ${suffix}`,forearm,M.skinLight,[-side*.032,-.262,.017],[.016,.033,.017],[0,0,-side*.32]);
    for (let finger=0;finger<3;finger++) seam(`Finger ${suffix} ${finger}`,forearm,M.skinShade,[[(-.017+finger*.016),-.316,.025],[(-.017+finger*.016),-.299,.029]],.0012);
    seam(`Sleeve seam ${suffix}`,arm,M.creamShade,[[side*.07,-.04,0],[side*.066,-.14,0],[side*.055,-.25,0]],.0018);
    const leg = group(`leg${suffix}`,avatar,side*.092,.907,0);
    loft(`Trouser thigh ${suffix}`,leg,M.navy,[[.023,.078,.092],[0,.087,.095],[-.105,.08,.088],[-.295,.065,.07],[-.387,.057,.064]],20);
    const shin = group(`shin${suffix}`,leg,0,-.405,0);
    loft(`Trouser calf ${suffix}`,shin,M.navy,[[.02,.061,.066],[-.04,.06,.066],[-.21,.051,.057],[-.375,.045,.05],[-.391,.046,.053]],20);
    cylinder(`Trouser hem ${suffix}`,shin,M.navyShade,.048,.048,.018,[0,-.382,0]);
    seam(`Pressed trouser crease ${suffix}`,leg,M.navyShade,[[0,-.05,.092],[0,-.17,.083],[0,-.37,.064]],.0018);
    seam(`Calf crease ${suffix}`,shin,M.navyShade,[[0,-.01,.065],[0,-.2,.057],[0,-.36,.052]],.0016);
    roundedBox(`Leather shoe ${suffix}`,shin,M.boot,[.113,.104,.226],[0,-.422,.042],.035);
    roundedBox(`Shoe sole ${suffix}`,shin,M.sole,[.12,.025,.236],[0,-.476,.045],.027);
    roundedBox(`Shoe welt ${suffix}`,shin,M.leather,[.12,.008,.234],[0,-.46,.045],.025);
    roundedBox(`Shoe tongue ${suffix}`,shin,M.boot,[.058,.019,.1],[0,-.368,.019],.013,[-.3,0,0]);
    for(let lace=0;lace<3;lace++) seam(`Shoelace ${suffix} ${lace}`,shin,M.laces,[[-.024,-.365-lace*.006,.004+lace*.022],[0,-.36-lace*.006,.012+lace*.022],[.024,-.365-lace*.006,.004+lace*.022]],.0023);
  }

  const backpack = group('backpack',torso,0,.267,-.151);
  roundedBox('Canvas backpack body',backpack,M.ochre,[.245,.29,.124],[0,0,-.019],.04);
  roundedBox('Backpack flap',backpack,M.ochreLight,[.241,.125,.028],[0,.077,-.091],.035,[.03,0,0]);
  roundedBox('Backpack lower pocket',backpack,M.ochre,[.17,.112,.045],[0,-.073,-.101],.022);
  seam('Backpack pocket piping',backpack,M.ochreLight,[[-.075,-.119,-.13],[-.083,-.08,-.131],[-.068,-.024,-.129],[.068,-.024,-.129],[.083,-.08,-.131],[.075,-.119,-.13]],.003);
  for(const side of [-1,1]) {
    roundedBox(`Pack flap leather strap ${side}`,backpack,M.leather,[.019,.12,.009],[side*.062,.046,-.112],.003);
    roundedBox(`Pack buckle ${side}`,backpack,M.brass,[.027,.026,.012],[side*.062,.014,-.117],.004);
    roundedBox(`Pack buckle inset ${side}`,backpack,M.leather,[.013,.013,.014],[side*.062,.014,-.125],.002);
    tube(`Shoulder strap ${side}`,torso,M.leather,[[side*.095,.09,-.146],[side*.155,.26,-.157],[side*.134,.475,-.031],[side*.117,.424,.123],[side*.132,.176,.112],[side*.108,.105,-.144]],.012,24);
    roundedBox(`Strap adjuster ${side}`,torso,M.brass,[.025,.022,.015],[side*.131,.233,.124],.004);
  }
  tube('Backpack handle',backpack,M.leather,[[-.04,.145,0],[-.034,.176,-.008],[.033,.176,-.008],[.04,.145,0]],.007);
  roundedBox('Pack stitched label',backpack,M.paper,[.052,.027,.003],[0,.083,-.109],.003);
  const book = group('book',torso,0,.286,.34); book.rotation.x = -1.3; book.scale.setScalar(0);
  for(const side of [-1,1]) {
    const half = group(`Book half ${side}`,book,side*.059,0,0); half.rotation.y = side*.20;
    roundedBox(`Book cover ${side}`,half,M.bookCover,[.12,.145,.01],[0,0,0],.005);
    roundedBox(`Book pages ${side}`,half,M.paper,[.112,.132,.019],[0,0,.012],.003);
    for(let line=0;line<5;line++) roundedBox(`Page printed line ${side} ${line}`,half,M.stoneShade,[.067,.002,.001],[0,.039-line*.017,.023],.0005);
  }
  roundedBox('Book spine',book,M.bookCover,[.013,.15,.03],[0,0,.009],.004);
  return { scene, avatar };
}

function makeEnvironment() {
  const scene = new THREE.Scene(); scene.name = 'Daylight · park furniture and sculpture';
  const bench=group('bench',scene);
  bench.userData={forward:'+Z',seatHeight:.47,width:1.7,origin:'ground center',cloneable:true};
  for(let slat=0;slat<5;slat++) {
    roundedBox(`Seat board ${slat}`,bench,slat%2?M.woodLight:M.wood,[1.66,.048,.085],[0,.443,-.182+slat*.092],.012);
    seam(`Seat woodgrain ${slat}`,bench,M.woodDark,[[-.67,.468,-.185+slat*.092],[-.19,.468,-.175+slat*.092],[.22,.468,-.187+slat*.092],[.72,.468,-.18+slat*.092]],.0012,18);
  }
  const back=group('Bench backrest',bench,0,.555,-.241); back.rotation.x=-.12;
  for(let slat=0;slat<3;slat++) {
    roundedBox(`Backrest board ${slat}`,back,slat%2?M.woodLight:M.wood,[1.66,.094,.041],[0,slat*.112,0],.012);
    seam(`Backrest grain ${slat}`,back,M.woodDark,[[-.76,slat*.112-.014,.022],[-.21,slat*.112-.007,.022],[.34,slat*.112-.019,.022],[.73,slat*.112-.01,.022]],.0013);
    for(const side of [-1,1]) cylinder(`Backrest bolt ${slat} ${side}`,back,M.brass,.008,.008,.006,[side*.659,slat*.112,.024],[P/2,0,0],10);
  }
  for(const side of [-1,1]) {
    const x=side*.662;
    tube(`Front curved leg ${side}`,bench,M.iron,[[x,.035,.18],[x,.13,.151],[x,.37,.143],[x,.457,.111]],.022,18);
    tube(`Rear curved leg ${side}`,bench,M.iron,[[x,.033,-.22],[x,.18,-.202],[x,.42,-.19],[x,.75,-.266],[x,.87,-.273]],.022,20);
    tube(`Seat support ${side}`,bench,M.iron,[[x,.405,-.21],[x,.409,0],[x,.405,.217]],.019);
    tube(`Armrest ${side}`,bench,M.iron,[[x,.448,.197],[x,.606,.194],[x,.65,.128],[x,.65,-.124],[x,.702,-.246]],.018,24);
    roundedBox(`Armrest timber ${side}`,bench,M.wood,[.072,.027,.276],[x,.662,.014],.015);
    tube(`Side decorative loop ${side}`,bench,M.iron,[[x,.393,-.11],[x,.28,-.097],[x,.253,.012],[x,.312,.071],[x,.381,.024]],.011,22);
    roundedBox(`Front foot pad ${side}`,bench,M.iron,[.099,.018,.093],[x,.017,.18],.017);
    roundedBox(`Rear foot pad ${side}`,bench,M.iron,[.099,.018,.093],[x,.017,-.22],.017);
    for(let slat=0;slat<5;slat++) cylinder(`Seat bolt ${slat} ${side}`,bench,M.brass,.006,.006,.005,[x,.47,-.182+slat*.092],[],8);
  }
  tube('Bench stretcher',bench,M.iron,[[-.66,.241,-.087],[0,.219,-.087],[.66,.241,-.087]],.013);
  const sign=group('sign',scene); sign.userData={forward:'+Z',height:1.64,origin:'ground center',cloneable:true};
  cylinder('Sign footing',sign,M.stone,.12,.155,.074,[0,.037,0],[],20);
  roundedBox('Walnut sign post',sign,M.woodDark,[.084,1.43,.085],[0,.79,0],.013);
  roundedBox('Post cap',sign,M.brass,[.102,.031,.104],[0,1.52,0],.013);
  ellipsoid('Post acorn finial',sign,M.brass,[0,1.563,0],[.037,.046,.037]);
  for(const [index,y,flip,mat] of [[0,1.35,1,M.mint],[1,1.097,-1,M.coral]]) {
    const arrow=group(`Direction plaque ${index}`,sign,0,y,.069);
    const shape=new THREE.Shape(); shape.moveTo(-.37,-.091); shape.lineTo(.242,-.091); shape.lineTo(.387,0); shape.lineTo(.242,.091); shape.lineTo(-.37,.091); shape.quadraticCurveTo(-.391,.091,-.391,.069); shape.lineTo(-.391,-.069); shape.quadraticCurveTo(-.391,-.091,-.37,-.091);
    const geo=new THREE.ExtrudeGeometry(shape,{depth:.03,bevelEnabled:true,bevelSize:.004,bevelThickness:.004,bevelSegments:2,steps:1});
    mesh(`Enamel arrow ${index}`,geo,mat,arrow,[0,0,0],[flip,1,1]);
    // Tiny embossed mountain / sea pictograms communicate wayfinding without raster text.
    tube(`Wayfinding path ${index}`,arrow,M.paper,[[-.29,-.025,.038],[-.22,.03,.038],[-.16,-.018,.038],[-.087,.037,.038],[-.015,-.025,.038]],.005);
    roundedBox(`Direction marker line ${index}`,arrow,M.paper,[.136,.012,.006],[.13,.015,.038],.004);
    roundedBox(`Direction marker short ${index}`,arrow,M.paper,[.096,.009,.006],[.11,-.018,.038],.003);
    for(const side of [-1,1]) cylinder(`Plaque bolt ${index} ${side}`,arrow,M.brass,.006,.006,.012,[side*.315,0,.039],[P/2,0,0],8);
  }
  const postcard=group('Hanging postcard',sign,.12,.765,.086); postcard.rotation.z=-.1;
  roundedBox('Postcard cream border',postcard,M.paper,[.273,.189,.013],[0,0,0],.009);
  roundedBox('Postcard sky',postcard,M.sky,[.235,.118,.004],[0,.015,.009],.002);
  roundedBox('Postcard distant water',postcard,M.blue,[.234,.039,.006],[0,-.024,.012],.002);
  ellipsoid('Postcard sun',postcard,M.ochreLight,[.067,.042,.017],[.017,.017,.002],[],14);
  tube('Postcard drawn hills',postcard,M.mint,[[-.116,-.004,.018],[-.075,.022,.018],[-.035,-.001,.018],[.015,.014,.018],[.116,-.007,.018]],.008);
  for(let i=0;i<3;i++) roundedBox(`Postcard caption ${i}`,postcard,M.woodDark,[.045+i*.013,.002,.003],[-.062+i*.066,-.069,.012],.0005);
  tube('Postcard twine',sign,M.leather,[[.0,.94,.061],[.006,.90,.079],[.035,.854,.091]],.0025);

  const plinth=group('plinth',scene); plinth.userData={topHeight:.7,origin:'ground center',cloneable:true};
  roundedBox('Plinth ground slab',plinth,M.stone,[.69,.068,.62],[0,.034,0],.026);
  roundedBox('Plinth lower step',plinth,M.stoneLight,[.607,.06,.548],[0,.096,0],.016);
  roundedBox('Plinth bottom moulding',plinth,M.stone,[.524,.067,.478],[0,.157,0],.023);
  const pillar=loft('Plinth tapering shaft',plinth,M.stone,[[.19,.22,.205],[.49,.198,.187],[.54,.204,.192]],4); pillar.rotation.y=P/4; pillar.scale.set(1.38,1,1.38);
  roundedBox('Plinth upper neck',plinth,M.stoneShade,[.472,.036,.43],[0,.552,0],.009);
  roundedBox('Plinth cornice',plinth,M.stoneLight,[.571,.07,.52],[0,.602,0],.019);
  roundedBox('Plinth top slab',plinth,M.stone,[.643,.071,.587],[0,.672,0],.015);
  roundedBox('Plinth bronze name plate',plinth,M.brass,[.165,.085,.007],[0,.36,.217],.008);
  for(let line=0;line<3;line++) roundedBox(`Plate engraving ${line}`,plinth,M.leather,[.103-line*.015,.004,.002],[0,.382-line*.021,.222],.001);

  const bust=group('bust',scene); bust.userData={height:.86,origin:'ground center',forward:'+Z',cloneable:true,subject:'Imaginary classical figure; original sculpture'};
  cylinder('Bust round socle base',bust,M.marbleShade,.188,.203,.045,[0,.0225,0],[],40);
  cylinder('Bust round socle lip',bust,M.marble,.174,.186,.035,[0,.062,0],[],40);
  cylinder('Bust turned pedestal',bust,M.marble,.123,.144,.085,[0,.12,0],[],32);
  ellipsoid('Bust draped shoulders',bust,M.marble,[0,.262,-.017],[.289,.145,.145],[],28);
  loft('Bust neck and chest',bust,M.marble,[[.169,.113,.086],[.254,.161,.108],[.351,.106,.083],[.435,.076,.075],[.482,.081,.081]],28);
  // Cloth folds are solid shallow sculptural ridges, an intentional classical silhouette.
  for(const side of [-1,1]) {
    tube(`Drapery outer fold ${side}`,bust,M.marbleLight,[[side*.25,.275,.031],[side*.176,.30,.106],[side*.087,.239,.118],[side*.015,.186,.099]],.014,20);
    tube(`Drapery inner fold ${side}`,bust,M.marbleShade,[[side*.235,.234,.065],[side*.153,.266,.118],[side*.071,.205,.107]],.0065,16);
    tube(`Clavicle ${side}`,bust,M.marbleLight,[[side*.014,.354,.081],[side*.089,.33,.097],[side*.161,.331,.056]],.007,18);
  }
  const sculptHead=group('Bust head',bust,0,.443,.012); sculptHead.rotation.y=-.12; sculptHead.rotation.z=-.045;
  loft('Bust carved face',sculptHead,M.marble,[[0,.04,.06,.013],[.025,.079,.087,.019],[.075,.119,.105,.016],[.135,.129,.112,.006],[.212,.124,.11,-.003],[.266,.105,.1,-.011],[.29,.07,.067,-.011],[.30,.001,.001,-.012]],32);
  for(const side of [-1,1]) {
    ellipsoid(`Bust cheekbone ${side}`,sculptHead,M.marbleLight,[side*.076,.111,.081],[.049,.032,.019]);
    ellipsoid(`Bust ear ${side}`,sculptHead,M.marble,[side*.128,.155,-.003],[.026,.047,.024]);
    ellipsoid(`Bust inner ear ${side}`,sculptHead,M.marbleShade,[side*.143,.155,.01],[.01,.028,.01]);
    ellipsoid(`Bust recessed eye ${side}`,sculptHead,M.marbleShade,[side*.046,.175,.103],[.031,.014,.01],[0,side*.22,0]);
    ellipsoid(`Bust stone eyeball ${side}`,sculptHead,M.marble,[side*.046,.174,.111],[.024,.009,.007]);
    tube(`Bust eyelid ${side}`,sculptHead,M.marbleLight,[[side*.02,.179,.109],[side*.045,.189,.113],[side*.071,.179,.104]],.0048);
    tube(`Bust brow ${side}`,sculptHead,M.marble,[[side*.017,.20,.109],[side*.045,.212,.117],[side*.077,.198,.099]],.01);
  }
  ellipsoid('Bust long nose bridge',sculptHead,M.marbleLight,[0,.15,.12],[.023,.045,.022],[-.15,0,0]);
  ellipsoid('Bust nose tip',sculptHead,M.marble,[0,.116,.147],[.027,.019,.024]);
  for(const side of [-1,1]) ellipsoid(`Bust nostril ${side}`,sculptHead,M.marbleShade,[side*.018,.105,.143],[.009,.004,.008]);
  tube('Bust upper lip',sculptHead,M.marbleLight,[[-.031,.073,.114],[-.01,.079,.123],[0,.075,.126],[.011,.079,.123],[.031,.073,.114]],.005);
  tube('Bust mouth recess',sculptHead,M.marbleShade,[[-.029,.068,.117],[0,.066,.127],[.029,.068,.117]],.0032);
  ellipsoid('Bust lower lip',sculptHead,M.marble,[0,.06,.116],[.031,.008,.012]);
  ellipsoid('Bust chin plane',sculptHead,M.marbleLight,[0,.029,.091],[.054,.024,.021]);
  // Hand arranged curls give the imaginary classical portrait a recognisable carved hair mass.
  mesh('Bust hair crown',new THREE.SphereGeometry(1,28,14,0,P*2,0,P*.62),M.marble,sculptHead,[0,.206,-.027],[.138,.12,.121]);
  for(let layer=0;layer<3;layer++) for(let i=0;i<11;i++) {
    const a=(-.91+i/10*1.82)*P, y=.258-layer*.048;
    const rx=.12+layer*.003, rz=.105;
    ellipsoid(`Carved curl ${layer} ${i}`,sculptHead,i%4===0?M.marbleLight:M.marble,[Math.sin(a)*rx,y,Math.cos(a)*rz-.023],[.034,.03,.028],[.25,a,.36*(i%2?1:-1)],12);
  }
  for(let i=0;i<7;i++) {
    const x=-.10+i*.033;
    tube(`Forehead curl ridge ${i}`,sculptHead,M.marbleLight,[[x,.277,.073],[x-.012,.249,.108],[x+.009,.231,.113],[x+.02,.244,.101]],.009,14);
  }
  return scene;
}

function rotationTrack(name, times, eulers) {
  const values=eulers.flatMap(e=>new THREE.Quaternion().setFromEuler(new THREE.Euler(...e)).toArray());
  return new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, values);
}
function vectorTrack(name, property, times, values) { return new THREE.VectorKeyframeTrack(`${name}.${property}`, times,values.flat()); }
function makeClips() {
  const times=[0,.25,.5,.75,1,1.25,1.5,1.75,2];
  const zero = times.map(()=>[0,0,0]);
  const clips=[];
  for(const mode of ['idle','walk','run','sit','read']) {
    const tracks=[];
    const moving=mode==='walk'||mode==='run', reading=mode==='read', sitting=mode==='sit';
    const speed=mode==='run'?2:1, amplitude=mode==='run'?.78:.48;
    const wave=times.map(t=>Math.sin(t/2*P*2*speed));
    const bob=times.map(t=>Math.cos(t/2*P*4*speed));
    tracks.push(vectorTrack('avatar','position',times,times.map((t,i)=>[0,sitting?-.395:moving?Math.max(0,1-bob[i])*(mode==='run'?.019:.009):0,0])));
    tracks.push(rotationTrack('torso',times,times.map((t,i)=>[mode==='run'?.10:reading?.025:0,moving?wave[i]*.038:0,moving?wave[i]*.023:Math.sin(t*P)*.008])));
    tracks.push(rotationTrack('head',times,times.map((t,i)=>[reading?.23:sitting?.02:0,moving?-wave[i]*.025:Math.sin(t*P)*.028,0])));
    for(const [suffix,side] of [['L',1],['R',-1]]) {
      tracks.push(rotationTrack(`arm${suffix}`,times,times.map((t,i)=>[reading?-.30:sitting?-.38:moving?wave[i]*amplitude*side*.65:-.045,reading?-side*.025:0,reading?-side*.175:side*.055])));
      tracks.push(rotationTrack(`forearm${suffix}`,times,times.map((t,i)=>[reading?-1.65:sitting?-.46:mode==='run'?-1.15+side*wave[i]*.13:moving?-.18-Math.max(0,-side*wave[i])*.17:-.07,0,0])));
      tracks.push(rotationTrack(`leg${suffix}`,times,times.map((t,i)=>[sitting?-1.5:moving?-wave[i]*amplitude*side:0,0,sitting?side*.04:0])));
      tracks.push(rotationTrack(`shin${suffix}`,times,times.map((t,i)=>[sitting?1.48:moving?Math.max(0,-wave[i]*side)*(mode==='run'?1.1:.55):0,0,0])));
    }
    tracks.push(vectorTrack('book','scale',times,times.map(()=>reading?[1,1,1]:[0,0,0])));
    const clip=new THREE.AnimationClip(mode,2,tracks); clips.push(clip);
  }
  return clips;
}

// Rigid parts share a mesh within each joint. Material colors become linear
// vertex colors so facial carving, stitches and cloth shades survive batching.
// Articulation groups and their clips remain untouched; no skinning is needed.
function batchRigidParts(scene, ownerNames) {
  const owners=new Set(ownerNames), batches=new Map(), originals=[], restoredScales=[];
  scene.traverse(o=>{
    if(owners.has(o.name) && o.scale.lengthSq()===0) {
      restoredScales.push([o,o.scale.clone()]);o.scale.setScalar(1);
    }
  });
  scene.updateMatrixWorld(true);
  scene.traverse(o=>{
    if(!o.isMesh)return;
    let owner=o.parent;
    while(owner && !owners.has(owner.name)) owner=owner.parent;
    if(!owner)throw new Error(`Unowned rigid mesh: ${o.name}`);
    const sourceMaterial=o.material;
    const roughness=Math.round(sourceMaterial.roughness*10)/10;
    const key=`${owner.uuid}:${roughness}:${sourceMaterial.metalness}`;
    if(!batches.has(key)) batches.set(key,{owner,roughness,metalness:sourceMaterial.metalness,geometries:[],sources:[]});
    const batch=batches.get(key);
    const geometry=o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    const relative=new THREE.Matrix4().copy(owner.matrixWorld).invert().multiply(o.matrixWorld);
    geometry.applyMatrix4(relative);
    const color=sourceMaterial.color, colors=new Float32Array(geometry.attributes.position.count*3);
    for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    batch.geometries.push(geometry);batch.sources.push(o.name);originals.push(o);
  });
  for(const o of originals)o.removeFromParent();
  const materials=new Map();
  for(const {owner,roughness,metalness,geometries,sources} of batches.values()) {
    const key=`${roughness}:${metalness}`;
    if(!materials.has(key)) materials.set(key,new THREE.MeshStandardMaterial({name:`Daylight vertex colors · roughness ${roughness} · metalness ${metalness}`,vertexColors:true,roughness,metalness}));
    const combined=mergeVertices(mergeGeometries(geometries),.00001);
    const result=mesh(`${owner.name} · ${metalness>0?'hardware':'sculpted detail'} · ${roughness}`,combined,materials.get(key),owner);
    result.userData.sourceParts=sources;
    for(const geometry of geometries)geometry.dispose();
  }
  for(const [o,scale] of restoredScales)o.scale.copy(scale);
  scene.updateMatrixWorld(true);
}

async function saveGLB(name, scene, animations=[]) {
  scene.updateMatrixWorld(true);
  const buffer = await new GLTFExporter().parseAsync(scene,{binary:true,animations,onlyVisible:false,trs:true});
  await writeFile(new URL(name,out),Buffer.from(buffer));
  return buffer;
}

function jsonChunk(buffer) {
  const dv=new DataView(buffer),jsonLength=dv.getUint32(12,true);
  if(dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2) throw new Error('Invalid GLB header');
  return JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,jsonLength)).trim());
}
async function inspectGLB(name,requiredNodes,requiredClips=[]) {
  const data=await readFile(new URL(name,out));
  const buffer=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
  const json=jsonChunk(buffer);
  const loaded=await new GLTFLoader().parseAsync(buffer,'');
  const names=[],meshCount={value:0},triangles={value:0};
  loaded.scene.traverse(n=>{names.push(n.name);if(n.isMesh){
    meshCount.value++;triangles.value+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;
    for(const [attributeName,attribute] of Object.entries(n.geometry.attributes)) if(!attribute.array.every(Number.isFinite))throw new Error(`Nonfinite geometry ${n.name}.${attributeName}`);
  }});
  for(const name of requiredNodes) if(!loaded.scene.getObjectByName(name)) throw new Error(`Missing node ${name}`);
  for(const name of requiredClips) if(!loaded.animations.some(c=>c.name===name)) throw new Error(`Missing clip ${name}`);
  const clipSamples=[];
  for(const clip of loaded.animations) {
    const mixer=new THREE.AnimationMixer(loaded.scene); const action=mixer.clipAction(clip); action.play(); mixer.setTime(.625); loaded.scene.updateMatrixWorld(true);
    loaded.scene.traverse(n=>{if(!n.matrixWorld.elements.every(Number.isFinite))throw new Error(`Nonfinite transform ${n.name}`);});
    clipSamples.push({name:clip.name,duration:clip.duration,tracks:clip.tracks.length,sampledAt:.625}); mixer.stopAllAction(); mixer.uncacheRoot(loaded.scene);
  }
  const box=new THREE.Box3().setFromObject(loaded.scene),size=new THREE.Vector3();box.getSize(size);
  const rootParts=name==='environment.glb'?['bench','sign','plinth','bust']:['avatar'];
  const parts=rootParts.map(partName=>{
    const part=loaded.scene.getObjectByName(partName),partBox=new THREE.Box3().setFromObject(part,true);let count=0;part.traverse(n=>{if(n.isMesh)count++;});
    return {name:partName,meshCount:count,bounds:{min:partBox.min.toArray(),max:partBox.max.toArray()}};
  });
  return {file:name,bytes:data.byteLength,meshCount:meshCount.value,triangles:triangles.value,nodeCount:names.length,materials:json.materials.length,externalResources:(json.images??[]).length+(json.buffers??[]).filter(b=>b.uri).length,allGeometryFinite:true,clips:clipSamples,requiredNodes,parts,standingBounds:{min:box.min.toArray(),max:box.max.toArray(),size:size.toArray()}};
}

const {scene:traveler}=makeTraveler();
const environment=makeEnvironment();
batchRigidParts(traveler,['avatar','torso','head','armL','armR','forearmL','forearmR','legL','legR','shinL','shinR','backpack','book']);
batchRigidParts(environment,['bench','sign','plinth','bust']);
await saveGLB('traveler.glb',traveler,makeClips());
await saveGLB('environment.glb',environment);
const report={generator:'Original mathematical geometry authored for this project; no downloaded models, images, or external data.',threeRevision:THREE.REVISION,assets:[
  await inspectGLB('traveler.glb',['avatar','head','torso','armL','armR','legL','legR','forearmL','forearmR','shinL','shinR','backpack'],['idle','walk','run','sit','read']),
  await inspectGLB('environment.glb',['bench','sign','plinth','bust']),
]};
await writeFile(new URL('validation.json',out),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
