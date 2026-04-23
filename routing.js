function buildGraphFromCorridors(floor) {
  const nodes = [];
  const nodeMap = new Map(); // 去重用

  const corridorData = MAP_DATA.corridors?.filter(c => c.floor === floor) || [];

  function getNodeId(p) {
    return `${p[0].toFixed(1)}_${p[1].toFixed(1)}_${floor}`;
  }

  function getOrCreateNode(p) {
    const id = getNodeId(p);
    if (!nodeMap.has(id)) {
      const node = { id, pos: p, floor, edges: [] };
      nodeMap.set(id, node);
      nodes.push(node);
    }
    return nodeMap.get(id);
  }

  // ===== 1. 走廊主干（带floor）=====
  corridorData.forEach(c => {
    const path = c.path;
    for (let i = 0; i < path.length; i++) {
      const n1 = getOrCreateNode(path[i]);
      if (i > 0) {
        const n0 = getOrCreateNode(path[i - 1]);
        const d = distance(n0.pos, n1.pos);
        n0.edges.push({ to: n1.id, weight: d });
        n1.edges.push({ to: n0.id, weight: d });
      }
    }
  });

  // ===== 2. 房间连接（关键优化）=====
  const roomsOnFloor = allRooms.filter(r => r.floor_number === floor);

  roomsOnFloor.forEach(room => {
    const center = room.center;

    let bestProj = null;
    let bestSeg = null;
    let minDist = Infinity;

    corridorData.forEach(c => {
      const path = c.path;
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        const proj = projectPointOnSegment(center, a, b);
        const d = distance(center, proj);

        if (d < minDist) {
          minDist = d;
          bestProj = proj;
          bestSeg = [a, b];
        }
      }
    });

    if (!bestProj) return;

    const roomNode = {
      id: room.room_id,
      pos: center,
      floor,
      edges: []
    };

    const doorNode = getOrCreateNode(bestProj);

    nodes.push(roomNode);

    // 房间 → 门口
    const d1 = distance(center, bestProj);
    roomNode.edges.push({ to: doorNode.id, weight: d1 });
    doorNode.edges.push({ to: roomNode.id, weight: d1 });

    // 门口 → 走廊线段两端（关键！不是只连最近点）
    const nA = getOrCreateNode(bestSeg[0]);
    const nB = getOrCreateNode(bestSeg[1]);

    const dA = distance(bestProj, nA.pos);
    const dB = distance(bestProj, nB.pos);

    doorNode.edges.push({ to: nA.id, weight: dA });
    doorNode.edges.push({ to: nB.id, weight: dB });

    nA.edges.push({ to: doorNode.id, weight: dA });
    nB.edges.push({ to: doorNode.id, weight: dB });
  });

  return nodes;
}

// 计算点 p 在线段 ab 上的投影点
function projectPointOnSegment(p, a, b) {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return [ax, ay];
  const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  const clampedT = Math.max(0, Math.min(1, t));
  return [ax + clampedT * dx, ay + clampedT * dy];
}

function dijkstra(nodes, startId, endId) {
  const dist = {}, prev = {}, visited = {};
  nodes.forEach(n => { dist[n.id] = Infinity; });
  dist[startId] = 0;

  const pq = [{ id: startId, d: 0 }];
  while (pq.length) {
    pq.sort((a, b) => a.d - b.d);
    const { id } = pq.shift();
    if (visited[id]) continue;
    visited[id] = true;
    if (id === endId) break;

    const node = nodes.find(n => n.id === id);
    if (!node) continue;
    node.edges.forEach(edge => {
      const newDist = dist[id] + edge.weight;
      if (newDist < dist[edge.to]) {
        dist[edge.to] = newDist;
        prev[edge.to] = id;
        pq.push({ id: edge.to, d: newDist });
      }
    });
  }

  const path = [];
  let cur = endId;
  while (cur) {
    const node = nodes.find(n => n.id === cur);
    if (node) path.unshift(node.pos);
    cur = prev[cur];
  }
  return path;
}

function findPath(startRoomId, endRoomId) {
  const startRoom = allRooms.find(r => r.room_id === startRoomId);
  const endRoom = allRooms.find(r => r.room_id === endRoomId);
  if (!startRoom || !endRoom) return [];

  const startFloor = startRoom.floor_number;
  const endFloor = endRoom.floor_number;

  // ===== 同层 =====
  if (startFloor === endFloor) {
    const nodes = buildGraphFromCorridors(startFloor);
    const path = dijkstra(nodes, startRoomId, endRoomId);

    return path.map(p => [p[0], p[1], startFloor]);
  }

  // ===== 跨层 =====
  const stairsStart = allRooms.filter(r => r.type === '楼梯间' && r.floor_number === startFloor);
  const stairsEnd = allRooms.filter(r => r.type === '楼梯间' && r.floor_number === endFloor);

  let bestPair = null;
  let minDist = Infinity;

  stairsStart.forEach(s1 => {
    stairsEnd.forEach(s2 => {
      const d = distance(s1.center, s2.center);
      if (d < minDist) {
        minDist = d;
        bestPair = [s1, s2];
      }
    });
  });

  if (!bestPair) return [];

  const [sStart, sEnd] = bestPair;

  // 分两段算
  const nodes1 = buildGraphFromCorridors(startFloor);
  const part1 = dijkstra(nodes1, startRoomId, sStart.room_id)
    .map(p => [p[0], p[1], startFloor]);

  const nodes2 = buildGraphFromCorridors(endFloor);
  const part2 = dijkstra(nodes2, sEnd.room_id, endRoomId)
    .map(p => [p[0], p[1], endFloor]);

  // 去重拼接（关键）
  return [...part1, ...part2];
}

// 简单路径平滑（可选）
function smoothPath(path) {
  if (path.length < 3) return path;
  const smoothed = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const next = path[i + 1];
    // 若三点几乎共线，可省略中间点
    const cross = (curr[0] - prev[0]) * (next[1] - curr[1]) - (curr[1] - prev[1]) * (next[0] - curr[0]);
    if (Math.abs(cross) > 1) { // 拐点保留
      smoothed.push(curr);
    }
  }
  smoothed.push(path[path.length - 1]);
  return smoothed;
}

function generateOrthogonalPath(p1, p2) {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  if (Math.abs(x1 - x2) > Math.abs(y1 - y2)) {
    return [p1, [x2, y1], p2];
  } else {
    return [p1, [x1, y2], p2];
  }
}

function distance(p1, p2) {
  return Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
}