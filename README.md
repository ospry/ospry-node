# ospry

Node.js bindings for the Ospry image hosting API. Learn more about Ospry at [ospry.io](https://ospry.io).

## About

**ospry** allows developers to upload, download, delete, and change permissions on images stored with Ospry's image hosting services. The most popular use for ospry is to verify client-side image uploads in a process we call [image claiming](https://ospry.io/docs#claiming).

The vast majority of users will want to use their secret API key when using ospry. This allows you to claim, delete, and change privacy permissions on individual images. A public key may be used in certain cases where only public upload and download functionality is required (e.g. a CLI tool).

## Requirements

To use ospry, you must have an active Ospry account. Sign up for one free at [ospry.io](https://ospry.io).

Each account comes with a "sandbox" pair of public/secret keys for development, and a set of production keys when you're ready to roll.

## Installation

Install ospry in your project directory using npm:

```
npm install ospry
```

## Image Uploading

### ospry.up(opts)

Uploads an image to Ospry with a given filename and privacy setting. Uploaded images are public by default.

**Returns:**

A writeable stream.

**Example:**

```js
var fstream = fs.createReadStream('foo.jpg');
var uploader = ospry.up({
  filename: 'bar.jpg',
  isPrivate: true,
  imageReady: function(err, imgMetadata) {
    console.log(imgMetadata);
  },  
});

fstream.pipe(uploader);
```

**Arguments:**

- `filename` (**required**): the filename to be used when the image is uploaded
- `isPrivate`: the privacy setting for the uploaded image. Defaults to `false` (public)
- `imageReady`: a callback for when the upload attempt is complete. Callback is in the form `fn(err, imgMetadata)`, where `err` is non-null if the upload failed.

## Image Downloading

### ospry.get(opts)

Downloads an image with the desired formatting and resizing options.

**Returns:**

A readable stream.

**Example:**

```js
var downloader = ospry.get({
  url: 'https://abc.ospry.io/foo/bar.jpg',
  format: 'png',
  maxWidth: 200,
});
```

```js
// Pipe to a file stream
var file = fs.createWriteStream('download.jpg')
downloader.pipe(file);
```

```js
// Pipe to an http.ServerResponse
downloader.pipe(res);
```

**Arguments:**

- `url` (**required**): the URL for an Ospry image
- `format`: desired image format of the downloaded image. Defaults to image's current format.
- `maxWidth`: desired image width, in pixels
- `maxHeight`: desired image height, in pixels
- `imageReady`: a callback for when the download attempt has finished. Callback is in the form `fn(err)`, where `err` is non-null if the download failed.

### ospry.getMetadata(id, fn)

Downloads the metadata for an Ospry image with the provided `id`.

**Example:**

```js
var id = 'image-id';
ospry.getMetadata(id, function(err, metadata) {
  if (err !== null) { ... handle error }
  else {
    console.log(metadata);
  }  
});
```

**Arguments:**

- `id`: (**required**) Ospry id of the requested image
- `fn`: (**required**) a callback in the form of `fn(err, metadata)`, where `err` is non-null if the request failed.

### ospry.formatURL(imgURL, opts)

Generates a valid Ospry download URL, including any desired formatting and resizing options.

For private images, the `expireSeconds` or `expireDate` options may be specified to provide temporary download access.

The returned URL can be used to download Ospry images directly (e.g. via an HTML `<img>`'s `src` attribute).

**Returns:**

A valid Ospry download URL (synchronously). If `expireSeconds` or `expireDate` is specified in the options, the URL will be signed with your secret API key, and can be used to allow temporary download access to the image.

**Example:**

```js
var url = 'https://foo.ospry.io/bar/baz.jpg';
var formattedURL = ospry.formatURL(url, {
  maxHeight: 120,
  expireSeconds: 60 * 5,
});
...
// Then use formattedURL in your HTML, for instance
```

**Arguments:**

- `imgURL` (**required**): The image's raw Ospry URL
- `opts`: {
- `format`: desired image format, defaults to current image format
- `maxWidth`: desired image width, in pixels
- `maxHeight`: desired image height, in pixels
- `expireSeconds`: the number of seconds (from now) during which a private image can be downloaded with the format URL.
- `expireDate`: a Date object specifying the last time a private image may be 
downloaded with the format URL.
- }

## Image Management

### ospry.makePrivate(id, fn)

Sets an image's privacy setting to `private`.

A private image can only be downloaded using the secret API key, or with a URL that has been signed with the secret API key using `ospry.formatURL`.

**Example: **

```js
var id = 'currently-public';
ospry.makePrivate(id, function(err, metadata) {
  if (err !== null) { ...handle error }
  else {
    console.log('Image is now private ', metadata.isPrivate);
  }  
});
```

**Arguments:**

- `id` (**required**): Ospry id of the image to make private
- `fn` (**required**): Callback called when the privacy update has finished. Callback has the form `fn(err, metadata)`, where `err` is non-null if the update failed.

### ospry.makePublic(id, fn)

Sets an image's privacy setting to `public`.

By default, images uploaded to Ospry are public.

**Example: **

```js
var id = 'currently-private';
ospry.makePublic(id, function(err, metadata) {
  if (err !== null) { ...handle error }
  else {
    console.log('Image is now public: ', !metadata.isPrivate);
  }  
});
```

**Arguments:**

- `id` (**required**): Ospry id of the image to make public
- `fn` (**required**): Callback called when the privacy update has finished. Callback has the form `fn(err, metadata)`, where `err` is non-null if the update failed.

### ospry.del(id, fn)

Deletes an image with the given `id`. If delete fails, an error will be provided in teh callback. A null error means the delete was successful.

Images can only be deleted using the secret API key.

**Example: **

```js
var id = 'id-to-delete';
ospry.del(id, function(err) {
  if (err !== null) { ...handle error }
  else {
    console.log('Image was deleted!');
  }  
});
```

**Arguments:**

- `id` (**required**): Ospry id of the image to delete
- `fn` (**required**): Callback called when the delete attempt has finished. Callback has the form `fn(err)`, where `err` is non-null if the delete failed.

### ospry.claim(id, fn)

Verifies an image uploaded client-side with [ospry.js](https://ospry.io/docs).

If claiming is enabled as an optional security mechanism on your account, each upload must be verified with your secret API key, or it will be treated as a rogue upload, and deleted from Ospry.

By default, claiming is disabled on your account. You can learn more about the claiming process in Ospry's [docs](https://ospry.io/docs).

**Example: **

```js
var id = 'new-client-upload';
// If claiming is enabled on your account, verify the new upload
ospry.claim(id, function(err, metadata) {
  if (err !== null) { ...handle error }
  else {
    console.log('Image is now claimed!', metadata);
  }  
});
```

**Arguments:**

- `id` (**required**): Ospry id of the image to claim
- `fn` (**required**): Callback called when the claim attempt has finished. Callback has the form `fn(err, metadata)`, where `err` is non-null if the claim failed.

## Reference

### Image Metadata

Calls that receive a `metadata` object in the callback can expect the following format:

```js
{
  id:          // {string}  Ospry image ID
  url:         // {string}  Ospry download URL
  timeCreated: // {Date}    Image upload time
  isClaimed:   // {boolean} Whether the image upload has been verified
  isPrivate:   // {boolean} Whether the image is private
  filename:    // {string}  Image filename
  format:      // {string}  Image format (e.g. "jpeg")
  size:        // {number}  Image file size in bytes
  height:      // {number}  Image height in pixels
  width:       // {number}  Image width in pixels
}
```

### Error Handling

Calls that receive an error back in ospry can expect the error to implement the Node Error contract: `name`, `message`, `stack`, plus `statusCode` when applicable.

For example, a `404` error looks like:

```js
{
  name: `not-found',
  statusCode: 404,
  message: 'Not found.',
  stack: ...
}
```
