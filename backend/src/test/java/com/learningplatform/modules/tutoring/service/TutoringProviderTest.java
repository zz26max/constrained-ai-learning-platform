package com.learningplatform.modules.tutoring.service;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import com.learningplatform.modules.tutoring.provider.*;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
class TutoringProviderTest {
 final JsonMapper json=JsonMapper.builder().findAndAddModules().build();
 TutoringProvider.Context context(){return new TutoringProvider.Context("ask",1,800,List.of("concept"),TutoringService.boundary(),"如何观察布局",null,null,List.of("解释空间"),List.of(),List.of());}
 @Test void externalCallsRequireBothSwitchesAndCompleteConfiguration(){assertThat(new ConfiguredTutoringProvider(json,false,true,"https://example.invalid","test","model").available()).isFalse();assertThat(new ConfiguredTutoringProvider(json,true,false,"https://example.invalid","test","model").available()).isFalse();assertThat(new ConfiguredTutoringProvider(json,true,true,"","","model").available()).isFalse();assertThatThrownBy(()->new ConfiguredTutoringProvider(json,false,false,"","","").generate(context())).isInstanceOf(IllegalStateException.class);}
 @Test void configurableAdapterParsesStructuredOutputAndUsage()throws Exception{var received=new AtomicReference<String>();String response=json.writeValueAsString(Map.of("choices",List.of(Map.of("message",Map.of("content",json.writeValueAsString(Map.of("mode","concept","hintLevel",1,"content","先观察可用空间。","nextAction","try_and_report"))))),"usage",Map.of("prompt_tokens",20,"completion_tokens",10)));var server=server(response,received);try{var p=new ConfiguredTutoringProvider(json,true,true,"http://127.0.0.1:"+server.getAddress().getPort()+"/chat","test-only-key","test-model");var output=p.generate(context());assertThat(output.content()).isEqualTo("先观察可用空间。");assertThat(output.inputTokens()).isEqualTo(20);assertThat(output.outputTokens()).isEqualTo(10);assertThat(received.get()).contains("test-model","max_tokens","800","Never provide complete solutions").doesNotContain("studentId","password_hash");}finally{server.stop(0);}}
 @Test void adapterBoundsUpstreamResponseBody()throws Exception{var server=server("x".repeat(66000),new AtomicReference<>());try{var p=new ConfiguredTutoringProvider(json,true,true,"http://127.0.0.1:"+server.getAddress().getPort()+"/chat","test-only-key","test-model");assertThatThrownBy(()->p.generate(context())).isInstanceOf(IllegalStateException.class);}finally{server.stop(0);}}
 HttpServer server(String response,AtomicReference<String> received)throws Exception{var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.createContext("/chat",exchange->{received.set(new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));byte[] bytes=response.getBytes(StandardCharsets.UTF_8);exchange.getResponseHeaders().add("Content-Type","application/json");exchange.sendResponseHeaders(200,bytes.length);try(var output=exchange.getResponseBody()){output.write(bytes);}exchange.close();});server.start();return server;}
}
