'use strict';

const Bucket = require('../bucket');
const VertexArrayType = require('../vertex_array_type');
const ElementArrayType = require('../element_array_type');
const loadGeometry = require('../load_geometry');
const EXTENT = require('../extent');

const shapeInterfaces = {
    layoutVertexArrayType: new VertexArrayType([{
        name: 'a_pos',
        components: 2,
        type: 'Int16'
    }]),
    elementArrayType: new ElementArrayType(),

    paintAttributes: [{
        name: 'a_color',
        components: 4,
        type: 'Uint8',
        getValue: (layer, globalProperties, featureProperties) => {
            return layer.getPaintValue("shape-color", globalProperties, featureProperties);
        },
        multiplier: 255,
        paintProperty: 'shape-color'
    }, {
        name: 'a_radius',
        components: 1,
        type: 'Uint16',
        isLayerConstant: false,
        getValue: (layer, globalProperties, featureProperties) => {
            return [layer.getPaintValue("shape-radius", globalProperties, featureProperties)];
        },
        multiplier: 10,
        paintProperty: 'shape-radius'
    }, {
        name: 'a_blur',
        components: 1,
        type: 'Uint16',
        isLayerConstant: false,
        getValue: (layer, globalProperties, featureProperties) => {
            return [layer.getPaintValue("shape-blur", globalProperties, featureProperties)];
        },
        multiplier: 10,
        paintProperty: 'shape-blur'
    }, {
        name: 'a_opacity',
        components: 1,
        type: 'Uint16',
        isLayerConstant: false,
        getValue: (layer, globalProperties, featureProperties) => {
            return [layer.getPaintValue("shape-opacity", globalProperties, featureProperties)];
        },
        multiplier: 255,
        paintProperty: 'shape-opacity'
    }, {
        name: 'a_type',
        components: 1,
        type: 'Uint16',
        isLayerConstant: false,
        getValue: (layer, globalProperties, featureProperties) => {
            return [layer.getPaintValue("shape-type", globalProperties, featureProperties)];
        },
        multiplier: 10,
        paintProperty: 'shape-type'
    }]
};

function addShapeVertex(layoutVertexArray, x, y, extrudeX, extrudeY) {
    layoutVertexArray.emplaceBack(
        (x * 2) + ((extrudeX + 1) / 2),
        (y * 2) + ((extrudeY + 1) / 2));
}

/**
 * Shapes are represented by two triangles.
 *
 * Each corner has a pos that is the center of the shape and an extrusion
 * vector that is where it points.
 * @private
 */
class ShapeBucket extends Bucket {
    constructor(options) {
        super(options, shapeInterfaces);
        this.layer = this.layers[0];
    }

    addFeature(feature) {
        const arrays = this.arrays;
        const shapeType = this.layer.getPaintValue("shape-type", null, feature.properties);

        for (const ring of loadGeometry(feature)) {
            for (const point of ring) {
                const x = point.x;
                const y = point.y;

                // Do not include points that are outside the tile boundaries.
                if (x < 0 || x >= EXTENT || y < 0 || y >= EXTENT) continue;

                // this geometry will be of the Point type, and we'll derive
                // two triangles from it.
                //
                // ┌─────────┐
                // │ 3     2 │
                // │         │
                // │ 0     1 │
                // └─────────┘

                const segment = arrays.prepareSegment(4);
                const index = segment.vertexLength;

                addShapeVertex(arrays.layoutVertexArray, x, y, -1, -1);
                addShapeVertex(arrays.layoutVertexArray, x, y, 1, -1);
                addShapeVertex(arrays.layoutVertexArray, x, y, 1, 1);
                addShapeVertex(arrays.layoutVertexArray, x, y, -1, 1);

                arrays.elementArray.emplaceBack(index, index + 1, index + 2);
                arrays.elementArray.emplaceBack(index, index + 3, index + 2);

                segment.vertexLength += 4;
                segment.primitiveLength += 2;
            }
        }

        arrays.populatePaintArrays(feature.properties);
    }
}

module.exports = ShapeBucket;
