docker login
# Detect architecture and build accordingly
if [ "$(uname -m)" = "x86_64" ]; then
    echo "Building for AMD64 architecture..."
    docker build -t grizzlar99/truthseeker:latest .
else
    echo "Building for non-AMD64 architecture using buildx..."
    docker buildx build --platform=linux/amd64 -t grizzlar99/truthseeker:latest .
fi
docker push grizzlar99/truthseeker:latest
