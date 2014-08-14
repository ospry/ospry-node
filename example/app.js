/* app.js
 *
 * Example usage of ospry-node bindings in an express app
 */

var app = require('express')();
var util = require('util');
var busboy = require('connect-busboy');

// Access API Key

var secretAPIKey = process.env.OSPRY_SECRET;
if (!secretAPIKey) {
  console.error('Error: An Ospry secret API key is required to run the example. You can pass one in using:\n  `OSPRY_SECRET=abc123yourkey node app.js`');
  process.exit(1);
}

// Initialize Ospry

var Ospry = require('../lib/ospry.js');
var ospry = new Ospry(secretAPIKey);

// Route Handlers

// Serve index.html
var serveIndex = function(req, res) {
  res.sendFile(__dirname + '/views/index.html');
};

// Render all images with both a public and signed URL, and resizing
var serveImages = function(req, res) {
  if (db.length === 0) { return res.send('No images uploaded yet'); }
  var pub = [];
  var signed = [];
  for (var i = 0; i < db.urls.length; i++) {
    pub.push(ospry.formatURL(db.urls[i], {maxHeight: 150}));
    signed.push(ospry.formatURL(db.urls[i], {expireSeconds: 30, maxHeight: 150}));
  }
  res.render('gallery', {urls: pub, signed: signed});
};

// Toggle the permissions on all uploaded images
var togglePrivate = function(req, res) {
  ospry.getMetadata(db.ids[0], function(err, metadata) {
    if (err) { return res.status(err.statusCode).end(); }
    var isPrivate = metadata.isPrivate;
    for (var i = 0; i < db.length; i++) {
      if (isPrivate) {
        ospry.makePublic(db.ids[i], function(err) { res.redirect('/images'); });
      } else {
        ospry.makePrivate(db.ids[i], function(err) { res.redirect('/images'); });
      }
    };
  });
};

// Upload images from multipart form, and store in Ospry
var uploadImages = function(req, res) {

  var uploadComplete = function(err, metadata) {
    if (err !== null) {
      console.error('Error with upload: ', err);
      res.status(err.statusCode).end();
      return;
    }
    // Upload successful, save image metadata
    console.log('Ospry upload success:\n\n ', util.inspect(metadata));
    db.push(metadata);
    res.redirect('/images');
  };

  req.busboy.on('file', function(field, fileStream, filename) {
    var upload = ospry.up({
      filename: filename,
      isPrivate: true,
      imageReady: uploadComplete,
    });
    fileStream.pipe(upload);
  });

  req.pipe(req.busboy);

};

// Configuration
app.set('view engine', 'jade');
app.engine('jade', require('jade').__express);
app.use(busboy());

app.get('/', serveIndex);
app.get('/images', serveImages);
app.post('/images', uploadImages);
app.post('/togglePrivate', togglePrivate);

app.listen(3000);
console.log('Ospry Express is listening on port 3000');

// Mock Database

var DB = function() {
  this.length = 0;
  this.urls = [];
  this.ids = [];
};

DB.prototype.push = function(metadata) {
  this.urls.push(metadata.url);
  this.ids.push(metadata.id);
  this.length++;
};

var db = new DB();
