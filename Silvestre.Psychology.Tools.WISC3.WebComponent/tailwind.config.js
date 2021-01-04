module.exports = {
    theme: {
        extend: {
            screens: {
                'print': { 'raw': 'print' }
            }
        }
    },
    plugins: [
        require('@tailwindcss/forms')
    ]
}