'use strict';

module.exports = drawShapes;

function drawShapes(painter, sourceCache, layer, coords) {
    if (painter.isOpaquePass) return;

    const gl = painter.gl;

    painter.setDepthSublayer(0);
    painter.depthMask(false);

    gl.disable(gl.STENCIL_TEST);

    for (let i = 0; i < coords.length; i++) {
        const coord = coords[i];

        const tile = sourceCache.getTile(coord);
        const bucket = tile.getBucket(layer);
        if (!bucket) continue;

        const buffers = bucket.buffers;
        const layerData = buffers.layerData[layer.id];
        const programConfiguration = layerData.programConfiguration;
        const program = painter.useProgram('shape', programConfiguration);
        programConfiguration.setUniforms(gl, program, layer, {zoom: painter.transform.zoom});

        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(program.u_texture, 0);

        const mapMoving = painter.options.rotating || painter.options.zooming;
        painter.spriteAtlas.bind(gl, mapMoving);
        gl.uniform2f(program.u_texsize, painter.spriteAtlas.width / 4, painter.spriteAtlas.height / 4);

        const s = painter.transform.altitude;
        const extrudeScale = [ painter.transform.pixelsToGLUnits[0] * s, painter.transform.pixelsToGLUnits[1] * s];
        gl.uniform2fv(program.u_extrude_scale, extrudeScale);

        gl.uniformMatrix4fv(program.u_matrix, false, painter.translatePosMatrix(
            coord.posMatrix,
            tile,
            layer.paint['shape-translate'],
            layer.paint['shape-translate-anchor']
        ));

        for (const segment of buffers.segments) {
            segment.vaos[layer.id].bind(gl, program, buffers.layoutVertexBuffer, buffers.elementBuffer, layerData.paintVertexBuffer, segment.vertexOffset);
            gl.drawElements(gl.TRIANGLES, segment.primitiveLength * 3, gl.UNSIGNED_SHORT, segment.primitiveOffset * 3 * 2);
        }
    }
}
