'use strict';

const StyleLayer = require('../style_layer');
const ShapeBucket = require('../../data/bucket/shape_bucket');

class ShapeStyleLayer extends StyleLayer {
    createBucket(options) {
        return new ShapeBucket(options);
    }
}

module.exports = ShapeStyleLayer;
