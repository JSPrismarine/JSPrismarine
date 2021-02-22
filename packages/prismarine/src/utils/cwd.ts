const cwd = () => {
    let dir = process.cwd();
    if (process.env.JSP_DIR) dir = `${dir}/${process.env.JSP_DIR}`;

    return dir;
};

export default cwd;
