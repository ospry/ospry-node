/* ospry.js */

// Module dependencies

var request = require('request');
var crypto  = require('crypto');
var url     = require('url');

// Constants

var _SERVER_URL = 'https://api.ospry.io/v1';

// Utility

var _isObject   = function(o) { return (typeof o === 'object' && o !== null && !(o instanceof Array)); };
var _isArray    = function(a) { return (a instanceof Array); };
var _isNumber   = function(n) { return (typeof n === 'number'); };
var _isString   = function(s) { return (typeof s === 'string'); };
var _isFunction = function(f) { return (typeof f === 'function'); };
var _nop        = function() {};

var _defaults = function(o, def) {
  var obj = {};
  for (var p in def) {
    if (def.hasOwnProperty(p)) {
      obj[p] = (typeof o[p] === 'undefined') ? def[p] : o[p];
    }
  }
  return obj;
};

// Internal

var _docsURLForError = function(name) {
  return 'https://ospry.io/docs#error-' + name;
};

var _ErrorNetwork = function() {
  var err = new Error('Network error');
  err.name = 'network-error';
  err.statusCode = null;
  err.docsURL = _docsURLForError('network-error');
  return err;
};

var _ErrorNotFound = function() {
  var err = new Error('Not found');
  err.name = 'not-found';
  err.statusCode = 404;
  err.docsURL = _docsURLForError('not-found');
  return err;
};

var _ErrorInternal = function() {
  var err = new Error('Internal error');
  err.name = 'internal-error';
  err.statusCode = 500;
  err.docsURL = _docsURLForError('internal-error');
  return err;
};

var _ErrorNotAuthorized = function() {
  var err = new Error('Forbidden');
  err.name = 'not-authorized';
  err.statusCode = 403;
  err.docsURL = _docsURLForError('not-authorized');
  return err;
};

var _wrapAPIError = function(e) {
  var err = new Error(e.message);
  err.name = e.cause;
  err.statusCode = parseInt(e.httpStatusCode);
  err.docsURL = e.docsUrl;
  return err;
};

var _parseAPIResponse = function(err, body) {
  if (err) { // Network error
    // TODO: Forward request error
    return { error: _ErrorNetwork() };
  }
  var json = (_isString(body) ? JSON.parse(body) : body);
  if (json.hasOwnProperty('timeCreated')) {
    json.timeCreated = new Date(json.timeCreated);
  }
  return json;
};

var _callAPI = function(opts, fn) {
  opts.auth = { user: opts.key, password: '' };
  return request(opts, function(err, res, body) {
    var json = _parseAPIResponse(err, body);
    if (json.hasOwnProperty('error')) {
      var error = _wrapAPIError(json.error);
      return fn(error, null);
    }
    fn(null, json.metadata); 
  });
};

// Ospry(key)
//
// Constructor to instantiate a new Ospry client.
//
// Arguments:
//
//   key:  (required) any valid Ospry API Key. In most
//         server-side cases, this will be a secret API key. 
//

// TODO: Document test options
var Ospry = function(key) {
  // TODO: Check this is a valid key? If not, throw?
  this._key = key;
  this._strictSSL = true;
  this._serverURL = _SERVER_URL;
};

// Ospry.formats
//
// List of allowable image formats for Ospry service
//
Ospry.formats = ['jpeg', 'png', 'gif'];

// ospry.up(opts)
//
// Uploads an image with a given filename and privacy setting. 
// Uploaded images are public by default.
//
// Returns a writeable stream that can be piped a file stream.
//
// Upload a file on disk:
//
//    fileStream.pipe(ospry.up(options))
//
// Arguments:
//
//   opts: {
//     filename   : (required) the image's filename
//     isPrivate  : image's privacy settting. Defaults to public.
//     imageReady : callback when upload attempt is complete.
//                  callback is in the form fn(err, imgMetadata)
//   }
Ospry.prototype.up = function(opts) {

  if (!_isObject(opts)) {
    throw new Error('ospry: required options argument is not an object');
  }
  if (!_isString(opts.filename)) {
    throw new Error('ospry: required filename is not a string');
  }

  opts = _defaults(opts, {
    filename: null,
    isPrivate: false,
    imageReady: _nop,
  });

  var u = url.parse(this._serverURL + '/images', true, true);
  u.query.filename = opts.filename;
  u.query.isPrivate = opts.isPrivate;

  var req = {
    method: 'POST',
    key: this._key,
    strictSSL: this._strictSSL,
    url: url.format(u),
    // Setting Content-Type to image/jpeg to distinguish from
    // multipart/form-data, but the image doesn't have to be a jpeg.
    // The server will parse for the correct image type.
    headers: {'Content-Type': 'image/jpeg' },
  };

  return _callAPI(req, opts.imageReady);
};

// ospry.get(opts)
// 
// Downloads an image with desired formatting and resizing options.
// 
// Returns a stream that can be piped directly to a file or HTTP
// response. 
//
// Pipe to a file stream:
//
//   ospry.get(opts).pipe(fileStream);
//
// Pipe to a HTTP response:
//
//   opsry.get(opts).pipe(res);
//
// Arguments:
//
//   opts: {
//     url        : (required) the image's Ospry URL
//     imageReady : callback when the download has finished. fn(err) 
//     format     : desired image format, defaults to current format
//     maxWidth   : desired image width, in pixels 
//     maxHeight  : desired image height, in pixels
//   }
//       
Ospry.prototype.get = function(opts) {
  if (!_isObject(opts)) {
    throw new Error('ospry: required options argument is not an object');
  }
  if (!_isString(opts.url)) {
    throw new Error('ospry: required image url is not a string');
  }
  if (!_isFunction(opts.imageReady)) {
    opts.imageReady = _nop;
  }

  // We dont' use a request callback here to avoid buffering the whole
  // image in memory.
  var responseErrorCode = null;
  var req = request({
    method: 'GET',
    strictSSL: this._strictSSL,
    url: this.formatURL(opts.url, opts),
  });

  req.on('error', function(err) { 
    return opts.imageReady(_ErrorNetwork());
  });

  req.on('abort', function() { 
    if (responseErrorCode !== null) {
      switch(responseErrorCode) {
      case 404:
        return opts.imageReady(_ErrorNotFound());
      case 403:
        return opts.imageReady(_ErrorNotAuthorized());
      default:
        return opts.imageReady(_ErrorInternal());
      }
    } else {
      opts.imageReady(_ErrorNetwork());
    }
  });

  req.on('complete', function() {
    // Success
    opts.imageReady(null);
  });

  req.on('response', function(res){
    if (res.statusCode !== 200) {
      responseErrorCode = res.statusCode;
      req.abort();
    }
  });

  return req;
};

// ospry.getMetadata(id, fn)
//
// Retrieves metadata for an Ospry image.
//
// Arguments:
// 
//   id: (required) Ospry id of the requested image
//   fn: (required) callback in the form of (err, imgMetadata)
//
Ospry.prototype.getMetadata = function(id, fn) {
  if (!_isString(id)) {
    throw new Error('ospry: required id is not a string');
  }
  if (!_isFunction(fn)) {
    throw new Error('ospry: required callback is not a function');
  }

  var req = {
    method: 'GET',
    url: this._serverURL + '/images/' + id,
    key: this._key,
    strictSSL: this._strictSSL,
  };

  _callAPI(req, fn);

};

// ospry.formatURL(imgURL, opts)
//
// Returns a valid Ospry download URL, including any desired
// formatting and resizing options.
//
// For private images, expireSeconds or expireDate may specified to
// provide temporary download access for an image.
// 
// The returned URL can be used to download Ospry images directly
// (e.g. via an HTML <img>'s src attribute.)
//
// Arguments: 
//
//   imgURL: (required) The image's URL, according to Ospry metadata
//
//   opts:
//   {
//     format        : desired image format, defaults to current format
//     maxWidth      : desired image width, in pixels 
//     maxHeight     : desired image height, in pixels 
//     expireDate    : a Date object specifying the last time a private image
//                     may be downloaded with this format URL. 
//     expireSeconds : the number of seconds (from now) during which a 
//                     private image can be downloaded with this format URL
//   }
//
Ospry.prototype.formatURL = function(imgURL, opts) {

  if (!_isString(imgURL)) {
    throw new Error('ospry: required image url is not a string');
  }
  if (!opts) {
    opts = {};
  }
  if (!_isObject(opts)) {
    throw new Error('ospry: required format options is not an object');
  }
  opts = _defaults(opts, {
    format: null,
    maxWidth: null,
    maxHeight: null,
    expireDate: null,
    expireSeconds: null,
  });

  // Skip URL parsing if no modifications are required.
  if (opts.format === null &&
      opts.maxWidth === null &&
      opts.maxHeight === null &&
      opts.expireDate === null &&
      opts.expireSeconds === null) {
    return imgURL;
  }

  // Fall back on query string formatting options, if present
  var u = url.parse(imgURL, true, true);

  if (opts.format === null && u.query.hasOwnProperty('format')) {
    opts.format = u.query.format;
  }
  if (opts.maxWidth === null && u.query.hasOwnProperty('maxWidth')) {
    opts.maxWidth = parseInt(u.query.maxWidth, 10);
    if (isNaN(opts.maxWidth)) {
      throw new Error('ospry: maxWidth should be a number');
    }
  }
  if (opts.maxHeight === null && u.query.hasOwnProperty('maxHeight')) {
    opts.maxHeight = parseInt(u.query.maxHeight, 10);
    if (isNaN(opts.maxHeight)) {
      throw new Error('ospry: maxHeight should be a number');
    }
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
    imgURL = u.query.url;
    u = url.parse(imgURL, true, true);
  } else {
    u.query = {};
    imgURL = url.format(u);
  }
  // If expiration time is present, the url needs to be signed.
  if (opts.expireDate !== null) {
    var payload = imgURL + '?timeExpired=' + encodeURIComponent(opts.expireDate.toISOString());
    var hmac = crypto.createHmac('sha256', this._key);
    hmac.update(payload);
    u.query.signature = hmac.digest('base64');
    u.query.url = imgURL;
    u.protocol = 'https:';
    u.host = url.parse(this._serverURL).host;
    u.pathname = '/';
    u.query.timeExpired = opts.expireDate.toISOString();
  }
  
  // Rebuild query string 
  if (opts.format !== null) {
    if (!_isString(opts.format)) {
      throw new Error('ospry: format is not a string');
    }
    if (opts.format !== '') {
      if (opts.format === 'jpg') { // Correct common jpg spelling
        opts.format = 'jpeg';
      }
      var found = false;
      for (var i = 0; i < Ospry.formats.length; i++) {
        if (Ospry.formats[i] === opts.format) {
          found = true;
          break;
        }
      }
      if (!found) {
        throw new Error('ospry: invalid image format (' + opts.format + ')');
      } else {
        u.query.format = opts.format;
      }
    } else {
      delete u.query.format;
    }
  }
  if (opts.maxHeight !== null) {
    if (!_isNumber(opts.maxHeight)) {
      throw new Error('ospry: maxHeight should be a number');
    }
    if (opts.maxHeight > 0) {
      u.query.maxHeight = opts.maxHeight;
    } else {
      delete u.query.maxHeight;
    }
  }
  if (opts.maxWidth !== null) {
    if (!_isNumber(opts.maxWidth)) {
      throw new Error('ospry: maxWidth should be a number');
    }
    if (opts.maxWidth > 0) {
      u.query.maxWidth = opts.maxWidth;
    } else {
      delete u.query.maxWidth;
    }
  }

  var props = [];
  var q = u.query;

  for (var p in q) {
    if (q.hasOwnProperty(p)) {
      props.push(p);
    }
  }

  props.sort();
  u.search = '';

  var first = true;

  for (var i = 0; i < props.length; i++) {
    var p = props[i];
    var items = q[p];
    if (!_isArray(items)) {
      items = [q[p]];
    } 
    for (var k = 0; k < items.length; k++) {
      if (first) {
        u.search += '?' + encodeURIComponent(p) + '=' + encodeURIComponent(items[k]);
        first= false;
      } else {
        u.search += '&' + encodeURIComponent(p) + '=' + encodeURIComponent(items[k]);
      }
    }
  }

  return url.format(u);
}

// ospry.claim(id, fn)
//
// Allows a developer to verify an uploaded image. If claiming is
// enabled on an account, the image must be claimed using the secret API
// key within the claiming window, or it will be deleted.
//
// Enabling/Disabling claiming is done through the Ospry account page.
//
// Arguments:
//
//   id: (required) Ospry id of the image to claim
//   fn: (required) callback in the form of fn(err, imgMetadata)
//
Ospry.prototype.claim = function(id, fn) {
  if (!_isString(id)) {
    throw 'ospry: required id is not a string';
  }
  if (!_isFunction(fn)) {
    throw 'ospry: required callback is not a function';
  }
  var req = {
    method: 'PUT',
    url: this._serverURL + '/images/' + id,
    key: this._key,
    strictSSL: this._strictSSL,
    json: {isClaimed: true},
  };

  _callAPI(req, fn);

};

// ospry.makePrivate(id, fn)
//
// Sets an image's privacy setting to private. A private image
// can only be downloaded using the secret API key, or a url signed
// with the secret API key.
//
// Arguments:
//
//  id: (required) Ospry id of the image to make private.
//  fn: (required) callback in the form of fn(err, imgMetadata)
// 
Ospry.prototype.makePrivate = function(id, fn) {
  if (!_isString(id)) {
    throw 'ospry: required id is not a string';
  }
  if (!_isFunction(fn)) {
    throw 'ospry: required callback is not a function';
  }
  var req = {
    method: 'PUT',
    url: this._serverURL + '/images/' + id,
    key: this._key,
    strictSSL: this._strictSSL,
    json: {isPrivate: true},
  };
  
  _callAPI(req, fn);
};

// ospry.makePublic(id, fn)
//
// Sets an image's privacy setting to public.
//
// Arguments:
//
//  id: (required) Ospry id of the image to make public.
//  fn: (required) callback in the form of fn(err, imgMetadata)
// 
Ospry.prototype.makePublic = function(id, fn) {
  if (!_isString(id)) {
    throw 'ospry: required id is not a string';
  }
  if (!_isFunction(fn)) {
    throw 'ospry: required callback is not a function';
  }
  var req = {
    method: 'PUT',
    url: this._serverURL + '/images/' + id,
    key: this._key,
    strictSSL: this._strictSSL,
    json: {isPrivate: false},
  };

  _callAPI(req, fn);

};

// ospry.del(id, fn)
//
// Deletes an image with the given id. If delete fails,
// an error will be provided in the callback. A null error
// means the delete was successful.
//
// Arguments:
//
//   id: (required) Ospry id of the image to delete.
//   fn: (required) callback in the form of fn(err)
//
Ospry.prototype.del = function(id, fn) {
  if (!_isString(id)) {
    throw 'ospry: required id is not a string';
  }
  if (!_isFunction(fn)) {
    throw 'ospry: required callback is not a function';
  }
  var req = {
    method: 'DELETE',
    url: this._serverURL + '/images/' + id,
    key: this._key,
    strictSSL: this._strictSSL,
  };

  _callAPI(req, fn);

};

// Export Ospry constructor
module.exports = Ospry;

