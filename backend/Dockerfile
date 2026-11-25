# API «Сұрақ қой» для сервера (ТЗ, 13). Собирается из backend/: docker compose -f deploy/docker-compose.yml build api
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY SuraqQoi.Api.csproj ./
RUN dotnet restore SuraqQoi.Api.csproj
COPY . .
RUN dotnet publish SuraqQoi.Api.csproj -c Release -o /app --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:9.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_CLI_TELEMETRY_OPTOUT=1
EXPOSE 8080
USER $APP_UID
# Аргументы передаются в Program.cs: docker compose run --rm api seed-demo
ENTRYPOINT ["dotnet", "SuraqQoi.Api.dll"]
