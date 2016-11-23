'use strict';

const Bucket = require('../bucket');
const VertexArrayType = require('../vertex_array_type');
const ElementArrayType = require('../element_array_type');
const Shaping = require('../../symbol/shaping');
const Quads = require('../../symbol/quads');
const loadGeometry = require('../load_geometry');
const resolveTokens = require('../../util/token');
const EXTENT = require('../extent');

const shapeIcon = Shaping.shapeIcon;
const getIconQuads = Quads.getIconQuads;

const shapeInterfaces = {
    layoutVertexArrayType: new VertexArrayType([{
        name: 'a_pos',
        components: 2,
        type: 'Int16'
    }, {
        name: 'a_offset',
        components: 2,
        type: 'Int16'
    }, {
        name: 'a_texture_pos',
        components: 2,
        type: 'Uint16'
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
        name: 'a_scale',
        components: 1,
        type: 'Uint16',
        isLayerConstant: false,
        getValue: (layer, globalProperties, featureProperties) => {
            return [layer.getPaintValue("shape-scale", globalProperties, featureProperties)];
        },
        multiplier: 10,
        paintProperty: 'shape-scale'
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
    }]
};

function addVertex(array, x, y, ox, oy, tx, ty) {
    array.emplaceBack(
			// a_pos
			x,
			y,

			// a_offset
			Math.round(ox * 64),
			Math.round(oy * 64),

			// a_texture_pos
			tx / 4,
			ty / 4);
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
        this.layers = options.layers;
        this.layer = this.layers[0];
        this.zoom = options.zoom;
    }

    populate(features, options) {
        const iconImageField = this.layer.layout['shape-image'];

        this.features = [];
        const icons = options.iconDependencies;

        for (const feature of features) {
            if (!this.layers[0].filter(feature)) {
                continue;
            }
            let icon;
            if (iconImageField) {
                icon = resolveTokens(feature.properties, iconImageField);
            }

            this.features.push({
                undefined,
                icon,
                geometry: loadGeometry(feature),
                properties: feature.properties
            });

            options.featureIndex.insert(feature, this.index);

            if (icon) {
                icons[icon] = true;
            }
        }
    }

    prepare(stacks, icons) {

        //const zoomHistory = { lastIntegerZoom: Infinity, lastIntegerZoomTime: 0, lastZoom: 0 };
        //this.adjustedIconMaxSize = this.layers[0].getLayoutValue('icon-size', {zoom: 18, zoomHistory: zoomHistory});
        //this.adjustedIconSize = this.layers[0].getLayoutValue('icon-size', {zoom: this.zoom + 1, zoomHistory: zoomHistory});

        const tileSize = 512 * this.overscaling;
        this.tilePixelRatio = EXTENT / tileSize;
        this.compareText = {};
        this.iconsNeedLinear = false;

        const layout = this.layers[0].layout;
        layout['icon-offset'] = [0, 0];

        for (const feature of this.features) {

            let shapedIcon;
            if (feature.icon) {
                const image = icons[feature.icon];
                shapedIcon = shapeIcon(image, layout);

                if (image) {
                    if (image.pixelRatio !== 1) {
                        this.iconsNeedLinear = true;
                    } else if (layout['icon-rotate'] !== 0 || !this.layers[0].isLayoutValueFeatureConstant('icon-rotate')) {
                        this.iconsNeedLinear = true;
                    }
                }
            }

            if (shapedIcon) {
                this.addFeature(feature, shapedIcon);
            }
        }
    }

    place(collisionTile, showCollisionBoxes) {
    }

    addFeature(feature, shapedIcon) {
        const arrays = this.arrays;

        for (const ring of feature.geometry) {
            for (const point of ring) {
                // Do not include points that are outside the tile boundaries.
                if (!point) return;
                if (point.x < 0 || point.x >= EXTENT || point.y < 0 || point.y >= EXTENT) return;
                const x = point.x;
                const y = point.y;

                const iconQuads = getIconQuads(point, shapedIcon, undefined, undefined, this.layer, false, undefined, {zoom: this.zoom}, feature.properties);
                const tl = iconQuads[0].tl,
                    tr = iconQuads[0].tr,
                    bl = iconQuads[0].bl,
                    br = iconQuads[0].br,
                    tex = iconQuads[0].tex;

                let segment;
                let index;

                // We use the segment property to allow markers to just draw half
                // SVGs for when there is stacked data (same geo) that we want
                // to not hide from the user
                if (feature.properties.segment) {
                    segment = arrays.prepareSegment(2);
                    index = segment.vertexLength;

                    // If the marker is just segment 1 we draw the top left triangle
                    if (feature.properties.segment === 1) {
                        addVertex(arrays.layoutVertexArray, x, y, tl.x, tl.y, tex.x, tex.y);
                    }
                    addVertex(arrays.layoutVertexArray, x, y, tr.x, tr.y, tex.x + tex.w, tex.y);
                    addVertex(arrays.layoutVertexArray, x, y, bl.x, bl.y, tex.x, tex.y + tex.h);

										// If the marker is just segment 2 we draw the bottom right triangle
                    if (feature.properties.segment === 2) {
                        addVertex(arrays.layoutVertexArray, x, y, br.x, br.y, tex.x + tex.w, tex.y + tex.h);
                    }

                    arrays.elementArray.emplaceBack(index, index + 1, index + 2);

                    segment.vertexLength += 3;
                    segment.primitiveLength += 1;
                } else {
                    // non-segmented markers draw both top left and bottom right
                    // triangles
                    segment = arrays.prepareSegment(4);
                    index = segment.vertexLength;

                    addVertex(arrays.layoutVertexArray, x, y, tl.x, tl.y, tex.x, tex.y);
                    addVertex(arrays.layoutVertexArray, x, y, tr.x, tr.y, tex.x + tex.w, tex.y);
                    addVertex(arrays.layoutVertexArray, x, y, bl.x, bl.y, tex.x, tex.y + tex.h);
                    addVertex(arrays.layoutVertexArray, x, y, br.x, br.y, tex.x + tex.w, tex.y + tex.h);

                    arrays.elementArray.emplaceBack(index, index + 1, index + 2);
                    arrays.elementArray.emplaceBack(index + 1, index + 2, index + 3);

                    segment.vertexLength += 4;
                    segment.primitiveLength += 2;
                }

            }
        }
        arrays.populatePaintArrays(feature.properties);
    }
}

module.exports = ShapeBucket;
