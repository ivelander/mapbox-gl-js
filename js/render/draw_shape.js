'use strict';

const browser = require('../util/browser');

module.exports = drawShapes;

function drawShapes(painter, sourceCache, layer, coords) {
    if (painter.isOpaquePass) return;

    const gl = painter.gl;

    painter.setDepthSublayer(0);
    painter.depthMask(false);

    // Allow shapes to be drawn across boundaries, so that
    // large shapes are not clipped to tiles
    gl.disable(gl.STENCIL_TEST);

    for (let i = 0; i < coords.length; i++) {
        const coord = coords[i];

        const tile = sourceCache.getTile(coord);
        const bucket = tile.getBucket(layer);
        if (!bucket) continue;

        const buffers = bucket.bufferGroups.shape;
        const programConfiguration = bucket.programConfigurations.shape[layer.id];
        const program = painter.useProgram('shape', programConfiguration);
        programConfiguration.setUniforms(gl, program, layer, {zoom: painter.transform.zoom});

        if (layer.paint['shape-pitch-scale'] === 'map') {
            gl.uniform1i(program.u_scale_with_map, true);
            gl.uniform2f(program.u_extrude_scale,
                painter.transform.pixelsToGLUnits[0] * painter.transform.altitude,
                painter.transform.pixelsToGLUnits[1] * painter.transform.altitude);
        } else {
            gl.uniform1i(program.u_scale_with_map, false);
            gl.uniform2fv(program.u_extrude_scale, painter.transform.pixelsToGLUnits);
        }

        gl.uniform1f(program.u_devicepixelratio, browser.devicePixelRatio);

        gl.uniformMatrix4fv(program.u_matrix, false, painter.translatePosMatrix(
            coord.posMatrix,
            tile,
            layer.paint['shape-translate'],
            layer.paint['shape-translate-anchor']
        ));

        for (const segment of buffers.segments) {
            segment.vaos[layer.id].bind(gl, program, buffers.layoutVertexBuffer, buffers.elementBuffer, buffers.paintVertexBuffers[layer.id], segment.vertexOffset);
            gl.drawElements(gl.TRIANGLES, segment.primitiveLength * 3, gl.UNSIGNED_SHORT, segment.primitiveOffset * 3 * 2);
        }
    }
}
