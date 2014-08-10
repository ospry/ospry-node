// Copyright 2014 Ospry Labs, LLC. All Rights Reserved.

var crypto = require('crypto');
var request = require('request');
var url = require('url');

var _errNetwork = {
  httpStatusCode: 0,
  cause: 'network-error',
  message: 'Network error.',
  docsUrl: 'https://ospry.io/docs#network-error',
};

var _nop = function() {};
var _isObject = function(o) { return (typeof o === 'object' && o !== null && !(o instanceof Array)); };
var _isArray = function(a) { return (a instanceof Array); };
var _isNumber = function(n) { return (typeof n === 'number'); };
var _isString = function(s) { return (typeof s === 'string'); };
var _isFunction = function(f) { return (typeof f === 'function'); };

var _defaults = function(o, d) {
  for (var p in d) {
    if (!d.hasOwnProperty(p)) {
      continue;
    }
    if (typeof o[p] === 'undefined') {
      o[p] = d[p];
    }
  }
};

var Ospry = function(key) {
  this._key = key;
  this._serverUrl = 'https://api.ospry.io/v1';
};

Ospry.formats = ['jpeg', 'png', 'gif', 'bmp'];

// Server-side upload from a stream source.
Ospry.prototype.up = function(opts) {
  if (!_isObject(opts)) {
    throw 'ospry: opts is not an object';
  }
  _defaults(opts, {
    filename: null,
    isPrivate: false,
    stream: null,
    imageReady: _nop,
  });
  if (opts.filename === null) {
    throw 'ospry: filename is missing from options';
  }
  if (opts.stream === null) {
    throw 'ospry: stream is missing from options';
  }
  var u = url.parse(this._serverUrl + '/images', true, true);
  u.query.filename = opts.filename;
  u.query.isPrivate = opts.isPrivate;
  opts.stream.pipe(this._send({
    method: 'POST',
    url: url.format(u),
    // Setting Content-Type to image/jpeg to distinguish from
    // multipart/form-data, but the image doesn't have to be a jpeg.
    headers: { 'Content-Type': 'image/jpeg' },
  }, function(err, images) {
    if (err !== null) {
      opts.imageReady(err, null);
    } else if (images[0].hasOwnProperty('error')) {
      opts.imageReady(images[0].error, null);
    } else {
      opts.imageReady(null, images[0]);
    } 
  }));
};

Ospry.prototype.get = function(opts) {
  if (!_isObject(opts)) {
    throw 'ospry: opts is not an object';
  }
  _defaults(opts, {
    url: null,
    format: null,
    maxHeight: null,
    maxWidth: null,
    timeExpired: null,
  });
  if (opts.url === null) {
    throw 'ospry: url is missing from options';
  }
  this._send({
    method: 'GET',
    url: this.formatUrl(url, opts),
  });
};

Ospry.prototype.formatUrl = function(imgUrl, opts) {
  if (!_isString(imgUrl)) {
    throw 'ospry: url is not a string';
  }
  if (typeof opts === 'undefined') {
    opts = {};
  }
  if (!_isObject(opts)) {
    throw 'ospry: opts is not an object';
  }
  _defaults(opts, {
    format: null,
    maxHeight: null,
    maxWidth: null,
    expireDate: null,
    expireSeconds: null,
  });
  // Skip url parsing if no modifications are required.
  if (opts.format === null &&
      opts.maxWidth === null &&
      opts.maxHeight === null &&
      opts.expireDate === null &&
      opts.expireSeconds === null) {
    return imgUrl;
  }
  var u = url.parse(imgUrl, true, true);
  if (opts.format === null && u.query.hasOwnProperty('format')) {
    opts.format = u.query.format;
  }
  if (opts.maxWidth === null && u.query.hasOwnProperty('maxWidth')) {
    opts.maxWidth = u.query.maxWidth;
  }
  if (opts.maxHeight === null && u.query.hasOwnProperty('maxHeight')) {
    opts.maxHeight = u.query.maxHeight;
  }
  if (opts.expireSeconds !== null) {
    var date = new Date();
    date.setTime(Date.now() + (opts.expireSeconds * 1000));
    opts.expireDate = date;
  }
  if (opts.expireDate === null && u.query.hasOwnProperty('timeExpired')) {
    opts.expireDate = new Date(u.query.timeExpired);
  }
  if (u.query.hasOwnProperty('url')) {
    imgUrl = u.query.url;
    u = url.parse(imgUrl);
  } else {
    u.query = {};
    imgUrl = url.format(u);
  }

  // If timeExpired is present, the url needs to be signed.
  if (opts.expireDate !== null) {
    var payload = imgUrl + '?timeExpired=' + encodeURIComponent(opts.expireDate.toISOString());
    var hmac = crypto.createHmac('sha256', this._key);
    hmac.update(payload);
    u.query.signature = hmac.digest('base64');
    u.query.url = imgUrl;
    u.protocol = 'https:';
    u.host = 'api.ospry.io';
    u.pathname = '/';
    u.query.timeExpired = opts.expireDate.toISOString();
  }

  if (opts.format !== null) {
    if (!_isString(opts.format)) {
      throw 'ospry: format should be a string';
    }
    if (opts.format !== '') {
      var found = false;
      for (var i = 0; i < Ospry.formats.length; i++) {
        if (Ospry.formats[i] === opts.format) {
          found = true;
          break;
        }
      }
      if (!found) {
        throw 'ospry: invalid format';
      }
      u.query.format = opts.format;
    } else {
      delete u.query.format;
    }
  }
  if (opts.maxHeight !== null) {
    if (!_isNumber(opts.maxHeight)) {
      throw 'ospry: maxHeight should be a number';
    }
    if (opts.maxHeight > 0) {
      u.query.maxHeight = opts.maxHeight;
    } else {
      delete u.query.maxHeight;
    }
  }
  if (opts.maxWidth !== null) {
    if (!_isNumber(opts.maxWidth)) {
      throw 'ospry: maxWidth should be a number';
    }
    if (opts.maxWidth > 0) {
      u.query.maxWidth = opts.maxWidth;
    } else {
      delete u.query.maxWidth;
    }
  }
  return url.format(u);
};

Ospry.prototype.getMetadata = function(ids, done) {
  if (!_isArray(ids)) {
    throw 'ospry: ids is not an array';
  }
  if (!_isFunction(done)) {
    throw 'ospry: done is not a function';
  }
  var u = url.parse(this._serverUrl + '/images', true, true);
  u.query['ids[]'] = ids;
  this._send({
    method: 'GET',
    url: url.format(u),
  }, done);
};

Ospry.prototype.claim = function(ids, done) {
  if (!_isArray(ids)) {
    throw 'ospry: ids is not an array';
  }
  if (!_isFunction(done)) {
    throw 'ospry: done is not a function';
  }
  var patches = [];
  for (var i = 0; i < ids.length; i++) {
    patches.push({id: ids[i], isClaimed: true});
  }
  this._send({
    method: 'PUT',
    url: this._serverUrl + '/images',
    json: patches,
  }, done);
};

Ospry.prototype.makePrivate = function(ids, done) {
  if (!_isArray(ids)) {
    throw 'ospry: ids is not an array';
  }
  if (!_isFunction(done)) {
    throw 'ospry: done is not a function';
  }
  var patches = [];
  for (var i = 0; i < ids.length; i++) {
    patches.push({id: ids[i], isPrivate: true});
  }
  this._send({
    method: 'PUT',
    url: this._serverUrl + '/images',
    json: patches,
  }, done);
};

Ospry.prototype.makePublic = function(ids, done) {
  if (!_isArray(ids)) {
    throw 'ospry: ids is not an array';
  }
  if (!_isFunction(done)) {
    throw 'ospry: done is not a function';
  }
  var patches = [];
  for (var i = 0; i < ids.length; i++) {
    patches.push({id: ids[i], isPrivate: false});
  }
  this._send({
    method: 'PUT',
    url: this._serverUrl + '/images',
    json: patches,
  }, done);
};

Ospry.prototype.del = function(ids, done) {
  if (!_isArray(ids)) {
    throw 'ospry: ids is not an array';
  }
  if (!_isFunction(done)) {
    throw 'ospry: done is not a function';
  }
  var u = url.parse(this._serverUrl + '/images', true, true);
  u.query['ids[]'] = ids;
  this._send({
    method: 'DELETE',
    url: url.format(u),
  }, done);
};

Ospry.prototype._send = function(req, done) {
  req.auth = { user: this._key, password: '' };
  return request(req, function(err, res, body) {
    if (err) {
      done(_errNetwork, null);
      return;
    }
    var json = (_isString(body) ? JSON.parse(body) : body);
    if (res.statusCode !== 200) {
      done(json.error, null);
      return;
    }
    for (var i = 0; i < json.images.length; i++) {
      json.images[i].timeCreated = new Date(json.images[i].timeCreated);
    }
    done(null, json.images);
  });
};

module.exports = Ospry;


