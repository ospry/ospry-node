var app = require('express')();
var util = require('util');
var busboy = require('connect-busboy');

var Ospry = require('../ospry.js');
var ospry = new Ospry('sk-test-***'); // Add your secret test API key here

// Route Handlers

// Serve index.html
var serveIndex = function(req, res) {
  res.sendFile(__dirname + '/views/index.html');
};

// Render all images with both a public and signed URL, and resizing
var serveImages = function(req, res) {
  if (db.length === 0) { return res.send('No images uploaded yet'); }
  var urls = db.urls;
  var pubURLs = [];
  var signedURLs = [];
  for (var i = 0; i < urls.length; i++) {
    pubURLs.push(ospry.formatUrl(urls[i], {maxHeight: 150}));
    signedURLs.push(ospry.formatUrl(urls[i], {expireSeconds: 30, maxHeight: 150}));
  }
  res.render('gallery', {urls: pubURLs, signed: signedURLs});
};

// Toggle the permissions on all uploaded images
var togglePrivate = function(req, res) {
  ospry.getMetadata([db.ids[0]], function(err, data) {
    if (err) { console.error(err); return res.status(err.httpStatusCode).end(); }
    var isPrivate = data[0].isPrivate;
    if (isPrivate) {
      ospry.makePublic(db.ids, function(err) { res.redirect('/images'); });
    } else {
      ospry.makePrivate(db.ids, function(err) { res.redirect('/images'); });
    }
  });
};

// Upload images from multipart form, and store in Ospry
var uploadImages = function(req, res) {

  var uploads = 0;
  var doneParsing = false;

  var finishedUpload = function(err, metadata) {
    uploads--;
    if (err === null) {
      // Upload successful, save image metadata
      console.log('Ospry upload success: ', util.inspect(metadata));
      db.push(metadata);
    }
    if (uploads === 0 && doneParsing) {
      res.redirect('/images');
    }
  };

  req.busboy.on('file', function(fieldname, fileStream, filename, encoding, mimetype) {
    uploads++;
    ospry.up({
      filename: filename,
      stream: fileStream,
      isPrivate: true,
      imageReady: finishedUpload,
    });
  });

  req.busboy.on('finish', function() { 
    doneParsing = true;
    if (uploads === 0) {
      res.redirect('/images');
    }
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
