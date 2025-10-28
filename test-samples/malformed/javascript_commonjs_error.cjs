/**
 * Test file with intentional syntax error: CommonJS with malformed export.
 */

function processItem(item) {
    return item.toUpperCase();
}

module.exports = {
    processItem,
    getData: function() {
        return {
            value: 42
        }  // Missing semicolon and comma
    otherFunc: () => {}  // This will cause syntax error due to missing comma
};
