function buildGraphFromCorridors(floor) {
  const nodes = [];
  const corridorData = MAP_DATA.corridors?.filter(c => c.floor === floor) || [];

  corridorData.forEach(corridor => {
    const path = corridor.path;
    for (let i = 0; i < path.length; i++) {
      const pt = path[i];
      let node = nodes.find(n => distance(n.pos, pt) < 0.1);
      if (!node) {
        node = { id: `c_${nodes.length}`, pos: pt, edges: [] };
        nodes.push(node);
      }
      if (i > 0) {
        const prevPt = path[i - 1];
        const prevNode = nodes.find(n => distance(n.pos, prevPt) < 0.1);
        const dist = distance(prevPt, pt);
        prevNode.edges.push({ to: node.id, weight: dist });
        node.edges.push({ to: prevNode.id, weight: dist });
      }
    }
  });

  const roomsOnFloor = allRooms.filter(r => r.floor_number === floor);
  roomsOnFloor.forEach(room => {
    const center = room.center;
    const roomNode = { id: room.room_id, pos: center, edges: [] };
    nodes.push(roomNode);

    let minDist = Infinity, nearest = null;
    nodes.forEach(n => {
      if (n.id.startsWith('c_')) {
        const d = distance(center, n.pos);
        if (d < minDist) { minDist = d; nearest = n; }
      }
    });
    if (nearest) {
      roomNode.edges.push({ to: nearest.id, weight: minDist });
      nearest.edges.push({ to: roomNode.id, weight: minDist });
    }
  });

  return nodes;
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

  if (startFloor === endFloor) {
    const nodes = buildGraphFromCorridors(startFloor);
    const path = dijkstra(nodes, startRoomId, endRoomId);
    if (path.length > 0) return path;
    console.warn('走廊寻路失败，使用直角折线');
    return generateOrthogonalPath(startRoom.center, endRoom.center);
  }

  // 跨楼层：寻找楼梯
  const stairsStart = allRooms.filter(r => r.type === '楼梯间' && r.floor_number === startFloor);
  const stairsEnd = allRooms.filter(r => r.type === '楼梯间' && r.floor_number === endFloor);
  if (stairsStart.length === 0 || stairsEnd.length === 0) {
    console.warn('缺少楼梯数据，使用直角折线');
    return generateOrthogonalPath(startRoom.center, endRoom.center);
  }

  let bestStairStart = stairsStart[0];
  let minDist = distance(startRoom.center, bestStairStart.center);
  stairsStart.forEach(s => {
    const d = distance(startRoom.center, s.center);
    if (d < minDist) { minDist = d; bestStairStart = s; }
  });

  const stairNumber = bestStairStart.name.match(/\d+/);
  let bestStairEnd = stairsEnd.find(s => stairNumber && s.name.includes(stairNumber[0]));
  if (!bestStairEnd) {
    bestStairEnd = stairsEnd[0];
    let minDistEnd = distance(endRoom.center, bestStairEnd.center);
    stairsEnd.forEach(s => {
      const d = distance(endRoom.center, s.center);
      if (d < minDistEnd) { minDistEnd = d; bestStairEnd = s; }
    });
  }

  const nodesStart = buildGraphFromCorridors(startFloor);
  const pathToStair = dijkstra(nodesStart, startRoomId, bestStairStart.room_id);
  const nodesEnd = buildGraphFromCorridors(endFloor);
  const pathFromStair = dijkstra(nodesEnd, bestStairEnd.room_id, endRoomId);

  if (pathToStair.length > 0 && pathFromStair.length > 0) {
    return [...pathToStair, bestStairEnd.center, ...pathFromStair];
  }
  return generateOrthogonalPath(startRoom.center, endRoom.center);
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

