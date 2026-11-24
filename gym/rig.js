/* Rig: drives a Mixamo-style glTF skeleton (e.g. three.js Xbot) from IK targets.
   All inputs/outputs are in the parent group's local coordinates. */
window.Rig = (() => {
  const V = THREE.Vector3, Q = THREE.Quaternion;
  const N = {hips:'Hips', sp0:'Spine', sp1:'Spine1', sp2:'Spine2', neck:'Neck', head:'Head', top:'HeadTop_End',
    ulL:'LeftUpLeg', llL:'LeftLeg', ftL:'LeftFoot', toeL:'LeftToeBase', ulR:'RightUpLeg', llR:'RightLeg', ftR:'RightFoot', toeR:'RightToeBase',
    arL:'LeftArm', faL:'LeftForeArm', hdL:'LeftHand', arR:'RightArm', faR:'RightForeArm', hdR:'RightHand', clL:'LeftShoulder', clR:'RightShoulder'};
  const CHILD = {hips:'sp0', sp0:'sp1', sp1:'sp2', sp2:'neck', neck:'head', head:'top', ulL:'llL', llL:'ftL', ulR:'llR', llR:'ftR', arL:'faL', faL:'hdL', arR:'faR', faR:'hdR', ftL:'toeL', ftR:'toeR', clL:'arL', clR:'arR'};
  const R = {ready:false, B:{}, rest:{}, len:{}, mats:[], root:null, parent:null, sM:1, modelH:1.78};
  const tq = new Q(), tv = new V();

  function basisQ(aim, sec){
    const y = aim.clone().normalize();
    const z = sec.clone().addScaledVector(y, -sec.dot(y));
    if (z.lengthSq() < 1e-8) z.set(0,0,1).addScaledVector(y, -y.z);
    z.normalize();
    const x = new V().crossVectors(y, z);
    return new Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }
  function twoBone(H, T, pole, a, b){
    const d = T.clone().sub(H); let dist = d.length(); const dir = d.divideScalar(dist || 1);
    dist = Math.min(Math.max(dist, Math.abs(a-b) + .01), a + b - .002);
    const cosA = (a*a + dist*dist - b*b)/(2*a*dist), sinA = Math.sqrt(Math.max(0, 1 - cosA*cosA));
    const n = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    return {K: H.clone().addScaledVector(dir, a*cosA).addScaledVector(n, a*sinA), E: H.clone().addScaledVector(dir, dist), n};
  }

  function load(url, parent, opts){
    opts = opts || {};
    R.parent = parent;
    return new Promise((res, rej) => {
      new THREE.GLTFLoader().load(url, g => {
        const root = g.scene; R.root = root;
        root.traverse(o => {
          if (o.isBone){ const n = o.name.replace(/^mixamorig:?/, ''); for (const k in N) if (N[k] === n) R.B[k] = o; }
          if (o.isSkinnedMesh){
            const joints = /Joints/i.test(o.name);
            const m = new THREE.MeshStandardMaterial({skinning:true, color: joints ? (opts.jointColor || 0x2b2f36) : (opts.color || 0xb8c4d0), roughness:.55, metalness:.05, transparent:true, opacity:1});
            o.material = m; R.mats.push(m); o.castShadow = true; o.frustumCulled = false;
          }
        });
        root.updateMatrixWorld(true);
        for (const k in R.B){
          const b = R.B[k], p = b.getWorldPosition(new V()), q = b.getWorldQuaternion(new Q());
          R.rest[k] = {p, q};
        }
        for (const k in CHILD){
          const c = CHILD[k]; if (!R.B[k] || !R.B[c]) continue;
          R.rest[k].aim = R.rest[c].p.clone().sub(R.rest[k].p).normalize();
          R.len[k] = R.rest[c].p.distanceTo(R.rest[k].p);
        }
        // secondary (forward) axes in rest: +Z for body/legs; elbows point back (-Z) in T-pose
        for (const k in R.rest) R.rest[k].sec = /^(ar|fa)/.test(k) ? new V(0,0,-1) : new V(0,0,1);
        let minY = Infinity; root.traverse(o => { if (o.isBone){ const y = o.getWorldPosition(tv).y; if (y < minY) minY = y; } });
        R.modelH = R.rest.top.p.y - minY;
        parent.add(root);
        R.ready = true; res(R);
      }, undefined, rej);
    });
  }

  function setHeight(Hm){
    if (!R.root) return;
    R.sM = Hm/R.modelH;
    R.root.scale.multiplyScalar(1/(R.root.userData.s || 1)); // reset
    R.root.userData.s = R.sM; R.root.scale.multiplyScalar(R.sM);
  }
  const L = k => R.len[k]*R.sM;

  function setWorldQ(bone, localQ){ // localQ: desired orientation in parent-group space
    const pw = R.parent.getWorldQuaternion(new Q());
    const want = pw.multiply(localQ);
    const bp = bone.parent.getWorldQuaternion(tq);
    bone.quaternion.copy(bp.invert().multiply(want));
    bone.updateMatrixWorld(true);
  }
  function orientAim(k, aim, sec){
    const r = R.rest[k];
    const rot = basisQ(aim, sec).multiply(basisQ(r.aim, r.sec).invert());
    setWorldQ(R.B[k], rot.multiply(r.q.clone()));
  }
  const posOf = k => R.parent.worldToLocal(R.B[k].getWorldPosition(new V()));

  /* spec: {pelvis:V, qP:Q, qT:Q, qH:Q, legs:{L:{ankle,pole,qFoot},R:{...}}, arms:{L:{hand,pole},R:{...}}} */
  function drive(s){
    if (!R.ready) return null;
    R.parent.updateMatrixWorld(true);
    const hips = R.B.hips;
    hips.position.copy(hips.parent.worldToLocal(R.parent.localToWorld(s.pelvis.clone())));
    hips.updateMatrixWorld(true);
    const Y = new V(0,1,0), Z = new V(0,0,1);
    orientAim('hips', Y.clone().applyQuaternion(s.qP), Z.clone().applyQuaternion(s.qP));
    [['sp0', .3], ['sp1', .65], ['sp2', 1]].forEach(([k, t]) => {
      const q = s.qP.clone().slerp(s.qT, t);
      orientAim(k, Y.clone().applyQuaternion(q), Z.clone().applyQuaternion(q));
    });
    const qN = s.qT.clone().slerp(s.qH, .5);
    orientAim('neck', Y.clone().applyQuaternion(qN), Z.clone().applyQuaternion(qN));
    orientAim('head', Y.clone().applyQuaternion(s.qH), Z.clone().applyQuaternion(s.qH));
    const out = {};
    // clavicles follow the chest; s.clav (rad) elevates them (shrug)
    if (s.clav !== undefined) for (const S of ['L','R']){
      const r = R.rest['cl'+S]; if (!r || !r.aim) continue;
      const qUp = new Q().setFromAxisAngle(Z, (S === 'L' ? 1 : -1)*s.clav);
      orientAim('cl'+S, r.aim.clone().applyQuaternion(qUp).applyQuaternion(s.qT), Z.clone().applyQuaternion(s.qT));
    }
    for (const S of ['L','R']){
      const lg = s.legs[S], H = posOf('ul'+S);
      const ik = twoBone(H, lg.ankle, lg.pole, L('ul'+S), L('ll'+S));
      orientAim('ul'+S, ik.K.clone().sub(H), ik.n);
      orientAim('ll'+S, ik.E.clone().sub(ik.K), ik.n);
      setWorldQ(R.B['ft'+S], lg.qFoot.clone().multiply(R.rest['ft'+S].q.clone()));
      out['hip'+S] = H; out['knee'+S] = ik.K; out['ankle'+S] = ik.E; out['pole'+S] = ik.n;
      const am = s.arms[S], Sh = posOf('ar'+S);
      const ia = twoBone(Sh, am.hand, am.pole, L('ar'+S), L('fa'+S));
      orientAim('ar'+S, ia.K.clone().sub(Sh), ia.n);
      orientAim('fa'+S, ia.E.clone().sub(ia.K), ia.n);
      out['sh'+S] = Sh; out['el'+S] = ia.K; out['hand'+S] = ia.E; out['apole'+S] = ia.n;
    }
    out.head = posOf('head'); out.spine = posOf('sp0');
    return out;
  }
  function setOpacity(o){ R.mats.forEach(m => { m.opacity = o; m.depthWrite = o > .95; m.needsUpdate = true; }); }
  function attachToHead(obj){ if (R.B.head) R.B.head.add(obj); }
  return Object.assign(R, {load, setHeight, drive, setOpacity, attachToHead});
})();
