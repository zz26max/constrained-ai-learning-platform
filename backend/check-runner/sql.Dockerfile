FROM mysql:8.4.11

# Use the Python runtime bundled with MySQL Shell in this base image.
ADD --chmod=0444 --checksum=sha256:e6b1d89711dd51f8f74b1631fe08f039e7d76cf67a42a323d3178f0f25762ed9 \
    https://files.pythonhosted.org/packages/7c/4c/ad33b92b9864cbde84f259d5df035a6447f91891f5be77788e2a3892bce3/pymysql-1.1.2-py3-none-any.whl \
    /tmp/pymysql-1.1.2-py3-none-any.whl
RUN /usr/lib/mysqlsh/bin/python3.13 -I -B -m pip install --no-index --no-deps \
    /tmp/pymysql-1.1.2-py3-none-any.whl

COPY sql-check.py /usr/local/libexec/lms-sql-check.py
