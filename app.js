const r = require('rethinkdb');
const io = require('socket.io')();

function createDrawing({ connection, name }) {
  return r.table('drawings')
  .insert({
    name,
    timestamp: new Date(),
  })
  .run(connection)
  .then(() => console.log('created a new drawing with name ', name));
}

function clearDrawing({ connection, drawingId }) {
  return r.table('lines')
  .filter({drawingId})
  .delete()
  .run(connection)
  .then(() => console.log('cleared drawing with this id ', drawingId));
}

function deleteDrawing({ connection, id }) {
  return r.table('drawings')
  .filter({id})
  .delete()
  .run(connection)
  .then(() => console.log('deleted drawing with this id ', id));
}


function subscribeToDrawings({ client, connection }) {
  r.table('drawings')
  .changes({ include_initial: true })
  .run(connection)
  .then((cursor) => {
    cursor.each((err, drawingRow) => client.emit('drawing', drawingRow.new_val));
  });
}

function handleLinePublish({ connection, line, callback }) {
  console.log('saving line to the db')
  r.table('lines')
  .insert(Object.assign(line, { timestamp: new Date() }))
  .run(connection)
  .then(callback);
}

function subscribeToDrawingLines({ client, connection, drawingId, from }) {
  let query = r.row('drawingId').eq(drawingId);

  if (from) {
    query = query.and(r.row('timestamp').ge(new Date(from)))
  }

  return r.table('lines')
  .filter(query)
  .changes({ include_initial: true, include_types: true })
  .run(connection)
  .then((cursor) => {
    cursor.each((err, lineRow) => client.emit(`drawingLine:${drawingId}`, lineRow.new_val));
  });
}

r.connect({
  host: 'localhost',
  port: 28015,
  db: 'colorsocket'
}).then((connection) => {
  io.on('connection', (client) => {
    client.on('createDrawing', ({ name }) => {
      createDrawing({ connection, name });
    });

    client.on('clearDrawing', ({ drawingId }) => {
      clearDrawing({ connection, drawingId });
    });

    client.on('deleteDrawing', ({ id }) => {
      console.log('este id', id)
      deleteDrawing({ connection, id });
    });


    client.on('subscribeToDrawings', () => subscribeToDrawings({
      client,
      connection,
    }));

    client.on('publishLine', (line, callback) => handleLinePublish({
      line,
      connection,
      callback,
    }));

    client.on('subscribeToDrawingLines', ({ drawingId, from }) => {
      subscribeToDrawingLines({
        client,
        connection,
        drawingId,
        from,
      });
    });
  });
});


const port = parseInt(process.argv[2], 10) || 5000;
io.listen(port);
console.log('listening on port ', port);
